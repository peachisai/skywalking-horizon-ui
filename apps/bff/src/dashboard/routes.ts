/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * `POST /api/layer/:key/dashboard` — runs each widget's MQE expression
 * against the OAP server and returns the result keyed by widget id.
 *
 * Body shape: `{ service?: string, widgets?: DashboardWidget[] }`. When
 * `widgets` is omitted, the BFF substitutes the layer's built-in
 * default set (see `defaults.ts`). When `service` is omitted, the BFF
 * picks the first service from `listServices(layer)` so the response
 * is never empty — UIs can pass an explicit service to scope.
 *
 * Each widget's expressions are batched into one GraphQL query via
 * aliases — same pattern as the landing route. Card widgets collapse
 * to a scalar (avg across the time-series window); line widgets keep
 * the full series per expression.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  DashboardResponse,
  DashboardWidget,
  DashboardWidgetResult,
  FetchLike,
} from '@skywalking-horizon-ui/api-client';
import type { ConfigSource } from '../config/loader.js';
import type { SessionStore } from '../auth/sessions.js';
import { requireAuth } from '../auth/middleware.js';
import {  graphqlPost, buildOapOpts } from '../oap/graphql-client.js';
import {
  allLayerTemplates,
  getLayerTemplate,
  widgetsForScope,
  writeLayerTemplate,
  type LayerTemplate,
} from '../layers/loader.js';
import { defaultWidgetsFor } from './defaults.js';

export interface DashboardRouteDeps {
  config: ConfigSource;
  sessions: SessionStore;
  fetch?: FetchLike;
}

const widgetSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  tip: z.string().optional(),
  type: z.enum(['card', 'line', 'top', 'record']),
  // Bumped from 8 to 16: JVM Memory Detail carries 11 pool metrics
  // (code cache + young/old/survivor/permgen/metaspace + z-heap +
  // compressed class space + 3 segmented codeheaps), and a few of the
  // language families approach the same range. 16 gives headroom for
  // future relabeled bundles without blowing the cap.
  expressions: z.array(z.string().min(1)).min(1).max(16),
  expressionLabels: z.array(z.string()).max(16).optional(),
  expressionUnits: z.array(z.string()).max(16).optional(),
  expressionAxes: z.array(z.number().int().min(0).max(1)).max(16).optional(),
  unit: z.string().optional(),
  span: z.number().int().min(1).max(12).optional(),
  rowSpan: z.number().int().min(1).max(64).optional(),
  visibleWhen: z.string().optional(),
  layerScope: z.boolean().optional(),
  // Legacy x/y/w/h kept optional for back-compat.
  x: z.number().int().min(0).optional(),
  y: z.number().int().min(0).optional(),
  w: z.number().int().positive().optional(),
  h: z.number().int().positive().optional(),
});
const scopeSchema = z.enum([
  'service',
  'instance',
  'endpoint',
  'dependency',
  'topology',
  'trace',
  'logs',
  'traceProfiling',
  'ebpfProfiling',
  'asyncProfiling',
]);
const bodySchema = z.object({
  service: z.string().optional(),
  /** Selected instance name. Honored only when `scope === 'instance'`
   *  (or any instance-derived scope) — the BFF flips the MQE entity to
   *  `{ scope: ServiceInstance, serviceName, serviceInstanceName }` so
   *  every widget on the Instance page evaluates against the chosen
   *  pair instead of the parent service. */
  serviceInstance: z.string().optional(),
  /** Selected endpoint name, analogous to `serviceInstance` but for
   *  the Endpoint page. Switches the entity to
   *  `{ scope: Endpoint, serviceName, endpointName }`. */
  endpoint: z.string().optional(),
  widgets: z.array(widgetSchema).max(40).optional(),
  scope: scopeSchema.optional(),
});

interface MqeOwner {
  scope?: string | null;
  serviceName?: string | null;
  serviceInstanceName?: string | null;
  endpointName?: string | null;
}
interface MqeValueShape {
  id?: string | null;
  value?: string | null;
  owner?: MqeOwner | null;
}
interface MqeLabelShape {
  key: string;
  value: string;
}
interface MqeMetadataShape {
  labels?: MqeLabelShape[] | null;
}
interface MqeValuesShape {
  metric?: MqeMetadataShape | null;
  values?: MqeValueShape[];
}
interface MqeResultShape {
  type: string;
  error?: string | null;
  results?: MqeValuesShape[];
}

const LIST_FIRST_SERVICE = /* GraphQL */ `
  query FirstService($layer: String!) {
    services: listServices(layer: $layer) { id name normal }
  }
`;

const DEFAULT_WINDOW_MIN = 60;

interface Window {
  start: string;
  end: string;
}
function fmtMinute(d: Date): string {
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}${mi}`;
}
function defaultWindow(): Window {
  const end = new Date();
  end.setUTCSeconds(0, 0);
  const start = new Date(end.getTime() - DEFAULT_WINDOW_MIN * 60_000);
  return { start: fmtMinute(start), end: fmtMinute(end) };
}

function buildFragment(
  alias: string,
  expression: string,
  serviceName: string,
  normal: boolean,
  w: Window,
  opts: {
    layerScope?: boolean;
    /** When set, the MQE entity flips to ServiceInstance scope and
     *  carries the selected instance name. Drives the Instance page. */
    serviceInstanceName?: string | null;
    /** When set, flips to Endpoint scope with this endpoint name. */
    endpointName?: string | null;
  } = {},
): string {
  // We fetch metric.labels (for multi-series Line widgets — relabels()
  // returns one labeled result per percentile) and value.id /
  // owner.endpointName (for TopList widgets — top_n() returns a
  // sorted list of entities + values).
  //
  // layerScope=true skips the serviceName filter so the MQE runs
  // across the whole layer — used for cross-service rollups like the
  // "Top 20 endpoints" widget on the per-layer Service page.
  let entity: string;
  if (opts.layerScope) {
    entity = '{ scope: All }';
  } else if (opts.serviceInstanceName) {
    entity =
      `{ scope: ServiceInstance, serviceName: ${JSON.stringify(serviceName)},` +
      ` serviceInstanceName: ${JSON.stringify(opts.serviceInstanceName)},` +
      ` normal: ${normal ? 'true' : 'false'} }`;
  } else if (opts.endpointName) {
    entity =
      `{ scope: Endpoint, serviceName: ${JSON.stringify(serviceName)},` +
      ` endpointName: ${JSON.stringify(opts.endpointName)},` +
      ` normal: ${normal ? 'true' : 'false'} }`;
  } else {
    entity = `{ scope: Service, serviceName: ${JSON.stringify(serviceName)}, normal: ${normal ? 'true' : 'false'} }`;
  }
  return (
    `${alias}: execExpression(\n` +
    `      expression: ${JSON.stringify(expression)},\n` +
    `      entity: ${entity},\n` +
    `      duration: { start: ${JSON.stringify(w.start)}, end: ${JSON.stringify(w.end)}, step: MINUTE }\n` +
    `    ) {\n` +
    `      type error\n` +
    `      results {\n` +
    `        metric { labels { key value } }\n` +
    `        values { id value owner { scope serviceName serviceInstanceName endpointName } }\n` +
    `      }\n` +
    `    }`
  );
}

function parseSeries(r: MqeResultShape | undefined): Array<number | null> | null {
  if (!r || r.error) return null;
  const values = r.results?.[0]?.values ?? [];
  if (values.length === 0) return null;
  return values.map((v) => {
    if (v.value === null || v.value === undefined) return null;
    const n = Number(v.value);
    return Number.isFinite(n) ? n : null;
  });
}
function avgOf(series: Array<number | null> | null): number | null {
  if (!series) return null;
  const xs = series.filter((v): v is number => v !== null);
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * Time-series MQE responses can carry multiple labeled results (one
 * relabel() call returns 5 results, one per percentile). Convert each
 * to a `DashboardSeries`. The label preference order:
 *  - explicit `relabels(..., key='...')` from metric.labels (multi-series)
 *  - fallback to the caller's expression text (single-series)
 *
 * Do NOT use `values[0].id` as a label — for time-series MQEs, OAP
 * returns the per-bucket timestamp/index as the value id, which is
 * useless as a series label.
 */
function parseLabeledSeries(
  r: MqeResultShape | undefined,
  fallbackLabel: string,
): Array<{ label: string; data: Array<number | null> }> | null {
  if (!r || r.error) return null;
  const out: Array<{ label: string; data: Array<number | null> }> = [];
  for (const rs of r.results ?? []) {
    const values = rs.values ?? [];
    if (values.length === 0) continue;
    const data = values.map((v) => {
      if (v.value === null || v.value === undefined) return null;
      const n = Number(v.value);
      return Number.isFinite(n) ? n : null;
    });
    // For relabels() results OAP returns multi-result responses with
    // metric.labels populated — take the last (most-derived) label
    // value, e.g. `percentile='99'`. Single-series results have no
    // labels; fall back to the operator's expression text.
    const labels = rs.metric?.labels ?? [];
    const lbl = labels.length > 0 ? labels[labels.length - 1].value : fallbackLabel;
    out.push({ label: lbl, data });
  }
  return out.length > 0 ? out : null;
}

/**
 * Extract a sorted list from a `top_n(...)` MQE response. Names follow
 * an entity-scope priority so layer-wide top lists (where the same
 * endpoint can appear in multiple services) stay disambiguated:
 *   Endpoint    →  "<service> · <endpoint>"  (or just endpoint when alone)
 *   Instance    →  "<service> · <instance>"
 *   Service     →  service
 *   fallback    →  raw id
 */
function parseTopList(
  r: MqeResultShape | undefined,
): Array<{ name: string; value: number | null }> | null {
  if (!r || r.error) return null;
  const values = r.results?.[0]?.values ?? [];
  if (values.length === 0) return null;
  return values.map((v) => {
    const o = v.owner;
    let name = '—';
    if (o?.endpointName) {
      name = o.serviceName ? `${o.serviceName} · ${o.endpointName}` : o.endpointName;
    } else if (o?.serviceInstanceName) {
      name = o.serviceName
        ? `${o.serviceName} · ${o.serviceInstanceName}`
        : o.serviceInstanceName;
    } else if (o?.serviceName) {
      name = o.serviceName;
    } else if (v.id) {
      name = v.id;
    }
    const num = v.value !== null && v.value !== undefined ? Number(v.value) : null;
    return { name, value: Number.isFinite(num as number) ? (num as number) : null };
  });
}

export function registerDashboardRoute(app: FastifyInstance, deps: DashboardRouteDeps): void {
  const auth = requireAuth(deps);
  app.post(
    '/api/layer/:key/dashboard',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const params = req.params as { key: string };
      const layerKey = params.key;
      if (!layerKey || !/^[a-z0-9_]+$/i.test(layerKey)) {
        return reply.code(400).send({ error: 'invalid_layer_key' });
      }
      const parsed = bodySchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
      }
      // Dev-mode query param `?mockTop=N` pads every TopList result to
      // exactly N entries with synthetic rows. Use to verify widget
      // height / overflow without waiting for OAP to populate the layer.
      const mockTopRaw = (req.query as { mockTop?: string }).mockTop;
      const mockTopN = mockTopRaw ? Math.max(0, Math.min(40, Number(mockTopRaw))) : 0;
      const scope = parsed.data.scope ?? 'service';
      const tpl = getLayerTemplate(layerKey);
      const widgets: DashboardWidget[] =
        parsed.data.widgets ??
        (tpl ? widgetsForScope(tpl, scope) : defaultWidgetsFor(layerKey));
      let serviceName = parsed.data.service ?? '';
      let normal = true;
      const cfgCurrent = deps.config.current;
      const opts = buildOapOpts(cfgCurrent, deps.fetch);
      const window = defaultWindow();

      const baseResp: DashboardResponse = {
        layer: layerKey,
        service: serviceName || null,
        generatedAt: Date.now(),
        step: 'MINUTE',
        durationStart: window.start,
        durationEnd: window.end,
        widgets: [],
        reachable: true,
      };

      // Step 1 — resolve service. We always probe `listServices` so the
      // correct `normal` flag rides along with the service entity. Some
      // layers (VIRTUAL_MQ, VIRTUAL_DATABASE, VIRTUAL_CACHE, AWS_*) use
      // `normal: false` services — without this look-up every MQE on
      // those layers comes back null because the entity-scope filter
      // doesn't match the data dimension OAP stored them under.
      try {
        const data = await graphqlPost<{ services: Array<{ id: string; name: string; normal: boolean }> }>(
          opts,
          LIST_FIRST_SERVICE,
          { layer: layerKey.toUpperCase() },
        );
        const all = data.services ?? [];
        let picked: { id: string; name: string; normal: boolean } | undefined;
        if (serviceName) {
          picked = all.find((s) => s.name === serviceName) ?? all.find((s) => s.id === serviceName);
          if (!picked) {
            return reply.send({
              ...baseResp,
              service: serviceName,
              widgets: widgets.map((w) => ({ id: w.id, error: `service "${serviceName}" not in layer` })),
            });
          }
        } else {
          picked = all[0];
          if (!picked) {
            return reply.send({
              ...baseResp,
              widgets: widgets.map((w) => ({ id: w.id, error: 'no service in layer' })),
            });
          }
        }
        serviceName = picked.name;
        normal = picked.normal !== false;
        baseResp.service = serviceName;
      } catch (err) {
        return reply.send({
          ...baseResp,
          reachable: false,
          error: err instanceof Error ? err.message : String(err),
          widgets: widgets.map((w) => ({ id: w.id, error: 'oap unreachable' })),
        });
      }

      // Step 2 — batch all widget × expression queries into one GraphQL trip.
      const fragments: string[] = [];
      const aliasMap = new Map<string, { wIdx: number; eIdx: number }>();
      // Per-widget scope plumbing: an instance-scoped page passes
      // `serviceInstance` in the body; an endpoint page passes
      // `endpoint`. Widgets that opt into `layerScope` always win over
      // both (they ignore the selected entity by design — they're
      // layer-wide rollups). When neither override applies, we keep
      // the legacy Service-scope behavior.
      const selectedInstance = parsed.data.serviceInstance ?? null;
      const selectedEndpoint = parsed.data.endpoint ?? null;
      const scopeHonorsInstance = scope === 'instance';
      const scopeHonorsEndpoint = scope === 'endpoint';
      widgets.forEach((widget, wIdx) => {
        widget.expressions.forEach((expr, eIdx) => {
          const alias = `w${wIdx}_e${eIdx}`;
          aliasMap.set(alias, { wIdx, eIdx });
          fragments.push(
            buildFragment(alias, expr, serviceName, normal, window, {
              layerScope: widget.layerScope === true,
              serviceInstanceName:
                widget.layerScope !== true && scopeHonorsInstance ? selectedInstance : null,
              endpointName:
                widget.layerScope !== true && scopeHonorsEndpoint ? selectedEndpoint : null,
            }),
          );
        });
      });
      let data: Record<string, MqeResultShape> = {};
      if (fragments.length > 0) {
        const query = `query DashboardMqe { ${fragments.join('\n    ')} }`;
        try {
          data = await graphqlPost<Record<string, MqeResultShape>>(opts, query);
        } catch (err) {
          return reply.send({
            ...baseResp,
            reachable: false,
            error: err instanceof Error ? err.message : String(err),
            widgets: widgets.map((w) => ({ id: w.id, error: 'mqe batch failed' })),
          });
        }
      }

      // Step 3 — collapse per widget. Per-type handling:
      //  - 'card': scalar = avg of the first non-null series
      //  - 'line': flatten every MQE result (one per series) — handles
      //    both the simple case (1 expression → 1 series) and the
      //    relabels() case (1 expression → N labeled series)
      //  - 'top':  extract sorted list from the first expression
      const results: DashboardWidgetResult[] = widgets.map((widget, wIdx) => {
        if (widget.type === 'top') {
          const groups: Array<{
            label: string;
            expression: string;
            unit?: string;
            items: NonNullable<ReturnType<typeof parseTopList>>;
          }> = [];
          widget.expressions.forEach((expr, eIdx) => {
            let items = parseTopList(data[`w${wIdx}_e${eIdx}`]);
            // Pad with synthetic rows when mockTop is requested. Each
            // padded row gets a plausible name + a value tapered down
            // from the last real row so the list reads as ranked.
            if (mockTopN > 0) {
              const current = items ?? [];
              const padCount = Math.max(0, mockTopN - current.length);
              if (padCount > 0) {
                const last = current[current.length - 1]?.value ?? 100;
                const seed = current[current.length - 1]?.name ?? 'mock-service';
                const padded = Array.from({ length: padCount }, (_, i) => {
                  const idx = current.length + i + 1;
                  const decay = 1 - (i + 1) / (padCount + 2);
                  return {
                    name: `${seed} · mock-${idx}`,
                    value: typeof last === 'number' ? Math.round(last * decay * 100) / 100 : 0,
                  };
                });
                items = [...current, ...padded];
              }
              if (!items || items.length === 0) {
                items = Array.from({ length: mockTopN }, (_, i) => ({
                  name: `mock-entity-${i + 1}`,
                  value: Math.round((100 - i * 8) * 100) / 100,
                }));
              }
            }
            if (!items) return;
            const label = widget.expressionLabels?.[eIdx] ?? expr;
            const unit = widget.expressionUnits?.[eIdx];
            groups.push({
              label,
              expression: expr,
              ...(unit ? { unit } : {}),
              items,
            });
          });
          if (groups.length === 0) return { id: widget.id, error: 'no data' };
          return {
            id: widget.id,
            topGroups: groups,
            topList: groups[0].items,
          };
        }

        if (widget.type === 'record') {
          // RECORD-typed MQE (slow SQL / slow statements) — the OAP
          // response is owner-keyed like topList but each entry also
          // carries a trace/segment id we surface for the drill-in.
          // We reuse parseTopList for the name/value pair; the
          // runtime record renderer is a separate phase and will
          // promote v.id / v.refId fields once it lands.
          const first = parseTopList(data[`w${wIdx}_e0`]);
          if (!first) return { id: widget.id, error: 'no data' };
          return {
            id: widget.id,
            records: first.map((r) => ({ name: r.name, value: r.value })),
          };
        }

        if (widget.type === 'card') {
          const first = widget.expressions.map((_, eIdx) =>
            parseSeries(data[`w${wIdx}_e${eIdx}`]),
          ).find((s) => s !== null);
          if (!first) return { id: widget.id, error: 'no data' };
          return { id: widget.id, value: avgOf(first) };
        }

        // 'line' — concat every result from every expression. One MQE
        // can return N labeled series (relabels()), so we don't assume
        // 1:1 between expressions and series. yAxisIndex + unit come
        // from the widget's per-expression overrides (when present).
        const flat: Array<{
          label: string;
          data: Array<number | null>;
          yAxisIndex?: number;
          unit?: string;
        }> = [];
        widget.expressions.forEach((expr, eIdx) => {
          const labeled = parseLabeledSeries(data[`w${wIdx}_e${eIdx}`], expr);
          if (!labeled) return;
          const labelOverride = widget.expressionLabels?.[eIdx];
          const axis = widget.expressionAxes?.[eIdx];
          const unit = widget.expressionUnits?.[eIdx];
          for (const s of labeled) {
            flat.push({
              // When the operator supplied an explicit expressionLabel
              // for a single-series expression, prefer that over the
              // OAP-side relabels value. Multi-series MQEs (relabels)
              // already arrive with sensible labels.
              label: labeled.length === 1 && labelOverride ? labelOverride : s.label,
              data: s.data,
              ...(axis !== undefined ? { yAxisIndex: axis } : {}),
              ...(unit !== undefined ? { unit } : {}),
            });
          }
        });
        if (flat.length === 0) return { id: widget.id, error: 'no data' };
        return { id: widget.id, series: flat };
      });

      return reply.send({ ...baseResp, widgets: results });
    },
  );

  // GET version returns the default widget config without running queries —
  // useful for the SPA to know what to render before invoking POST.
  // Accepts ?scope=service|instance|endpoint|dependency|topology|trace|logs|traceProfiling|ebpfProfiling|asyncProfiling.
  app.get(
    '/api/layer/:key/dashboard/config',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const params = req.params as { key: string };
      const layerKey = params.key;
      if (!layerKey || !/^[a-z0-9_]+$/i.test(layerKey)) {
        return reply.code(400).send({ error: 'invalid_layer_key' });
      }
      const q = req.query as { scope?: string };
      const scopeParsed = q.scope ? scopeSchema.safeParse(q.scope) : null;
      const scope = scopeParsed?.success ? scopeParsed.data : 'service';
      const tpl = getLayerTemplate(layerKey);
      const widgets = tpl ? widgetsForScope(tpl, scope) : defaultWidgetsFor(layerKey);
      return reply.send({ layer: layerKey, scope, widgets });
    },
  );

  // Admin: enumerate every loaded JSON layer template. Used by the
  // /admin/layer-dashboards page to render a layer picker + current
  // widget set per layer.
  app.get('/api/admin/layer-templates', { preHandler: auth }, async (_req, reply) => {
    return reply.send({ templates: allLayerTemplates() });
  });

  // Admin: persist an operator-edited template back to its JSON file.
  // Body is the whole template; the BFF rewrites the file and
  // invalidates its in-memory cache so subsequent reads see the new
  // shape immediately.
  const adminTemplateSchema = z.object({
    key: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    alias: z.string().optional(),
    color: z.string().optional(),
    documentLink: z.string().optional(),
    slots: z
      .object({
        services: z.string().optional(),
        instances: z.string().optional(),
        endpoints: z.string().optional(),
        endpointDependency: z.string().optional(),
      })
      .strict(),
    components: z
      .object({
        service: z.boolean().optional(),
        instances: z.boolean().optional(),
        endpoints: z.boolean().optional(),
        endpointDependency: z.boolean().optional(),
        topology: z.boolean().optional(),
        traces: z.boolean().optional(),
        logs: z.boolean().optional(),
        traceProfiling: z.boolean().optional(),
        ebpfProfiling: z.boolean().optional(),
        asyncProfiling: z.boolean().optional(),
      })
      .strict(),
    metrics: z
      .object({
        orderBy: z.string().optional(),
        columns: z
          .array(
            z.object({
              metric: z.string().min(1),
              label: z.string(),
              unit: z.string().optional(),
              mqe: z.string().optional(),
              aggregation: z.enum(['sum', 'avg']).optional(),
              scale: z.number().finite().optional(),
              precision: z.number().int().min(0).max(6).optional(),
            }),
          )
          .max(5)
          .optional(),
      })
      .strict(),
    overview: z
      .object({
        throughput: z.string().optional(),
        spark: z.string().optional(),
      })
      .strict()
      .optional(),
    dashboards: z
      .object({
        service: z.array(widgetSchema).max(40).optional(),
        instance: z.array(widgetSchema).max(40).optional(),
        endpoint: z.array(widgetSchema).max(40).optional(),
        dependency: z.array(widgetSchema).max(40).optional(),
        topology: z.array(widgetSchema).max(40).optional(),
        trace: z.array(widgetSchema).max(40).optional(),
        logs: z.array(widgetSchema).max(40).optional(),
        traceProfiling: z.array(widgetSchema).max(40).optional(),
        ebpfProfiling: z.array(widgetSchema).max(40).optional(),
        asyncProfiling: z.array(widgetSchema).max(40).optional(),
      })
      .strict()
      .optional(),
    widgets: z.array(widgetSchema).max(40).optional(),
    naming: z
      .object({
        pattern: z.string().min(1),
        flags: z.string().optional(),
        displayGroup: z.string().optional(),
        valueGroup: z.string().optional(),
        alias: z.string().min(1),
      })
      .strict()
      .optional(),
  });

  app.post(
    '/api/admin/layer-templates/:key',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const params = req.params as { key: string };
      const layerKey = params.key.toUpperCase();
      const parsed = adminTemplateSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_template', detail: parsed.error.flatten() });
      }
      if (parsed.data.key.toUpperCase() !== layerKey) {
        return reply.code(400).send({ error: 'key_mismatch', detail: 'URL key does not match body key' });
      }
      try {
        writeLayerTemplate(parsed.data as LayerTemplate);
      } catch (err) {
        return reply.code(500).send({
          error: 'write_failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }
      const refreshed = getLayerTemplate(layerKey);
      return reply.send({ template: refreshed });
    },
  );
}
