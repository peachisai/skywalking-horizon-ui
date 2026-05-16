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
 * `/api/alarms/*` routes — alarm list + background-traffic series for
 * the alarms page + admin config.
 *
 *   GET  /api/alarms                            — OAP getAlarm proxy
 *                                                 + layer tag per row.
 *   GET  /api/alarms/traffic                    — per-configured-layer
 *                                                 RPM time-series.
 *   GET  /api/alarms/config                     — current alarm-page
 *                                                 setup.
 *   POST /api/alarms/config                     — save alarm-page setup.
 *
 * Notes:
 *   - All times on the wire are millisecond epoch. OAP's Duration
 *     takes a `yyyy-MM-dd HHmm` string in OAP-server-TZ; the helper
 *     below converts ms → that shape using the server tz from
 *     `getTimeInfo` (cached upstream).
 *   - Layer tagging uses the cached service-name → layer index. If
 *     the index doesn't know the service (e.g. instance / endpoint
 *     scope), `layerKey` is `null` and the UI groups under "Other".
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { FetchLike } from '@skywalking-horizon-ui/api-client';
import { z } from 'zod';
import { requireAuth } from '../auth/middleware.js';
import type { ConfigSource } from '../config/loader.js';
import type { SessionStore } from '../auth/sessions.js';
import type { AuditLogger } from '../audit/logger.js';
import { badRequest } from '../errors.js';
import { buildOapOpts, graphqlPost } from '../oap/graphql-client.js';
import { ServiceLayerMap } from './service-layer-map.js';
import type { AlarmsStore, AlarmsConfig } from './store.js';

export interface AlarmsRouteDeps {
  config: ConfigSource;
  sessions: SessionStore;
  audit: AuditLogger;
  store: AlarmsStore;
  fetch?: FetchLike;
}

// ── Wire types (mirror alarm.graphqls) ───────────────────────────────

export interface MqeKeyValue {
  key: string;
  value: string;
}

export interface MqeValueRow {
  id?: string | null;
  value: string | null;
  traceID?: string | null;
}

export interface MqeValuesGroup {
  metric?: { labels?: MqeKeyValue[] } | null;
  values: MqeValueRow[];
}

export interface MqeMetric {
  name: string;
  results: MqeValuesGroup[];
}

export interface AlarmSnapshot {
  expression: string;
  metrics: MqeMetric[];
}

export type AlarmScope =
  | 'All'
  | 'Service'
  | 'ServiceInstance'
  | 'Endpoint'
  | 'Process'
  | 'ServiceRelation'
  | 'ServiceInstanceRelation'
  | 'EndpointRelation'
  | 'ProcessRelation'
  | null;

export interface AlarmMessage {
  id: string;
  /** ms epoch */
  startTime: number;
  /** ms epoch, null = still firing */
  recoveryTime: number | null;
  scope: AlarmScope;
  name: string;
  message: string;
  tags: MqeKeyValue[];
  events?: Array<Record<string, unknown>>;
  snapshot: AlarmSnapshot;
  /** Best-effort layer tag derived from service-layer-map. Null when
   *  the entity isn't a known service (instance / endpoint / etc.
   *  fall through if their service prefix doesn't match). */
  layerKey: string | null;
}

export interface AlarmsResponse {
  total: number;
  pageNum: number;
  pageSize: number;
  generatedAt: number;
  msgs: AlarmMessage[];
}

export interface AlarmTrafficPoint {
  /** ms epoch */
  ts: number;
  value: number | null;
}

export interface AlarmTrafficSeries {
  layerKey: string;
  label: string;
  /** True when OAP recognised the layer AND `listServices` returned
   *  at least one service. False slots still appear in the response
   *  so the UI can show the empty / unavailable state. */
  present: boolean;
  /** ms-keyed points across the requested window. */
  points: AlarmTrafficPoint[];
  /** Per-layer error string when OAP returned a graphql error or the
   *  layer is missing. */
  error?: string;
}

export interface AlarmTrafficResponse {
  generatedAt: number;
  /** Window start / end, ms epoch — echoed back so the UI can align
   *  the alarm markers and the traffic lines on a single x-axis. */
  startTime: number;
  endTime: number;
  step: 'MINUTE';
  series: AlarmTrafficSeries[];
}

// ── Helpers ──────────────────────────────────────────────────────────

interface ServerTzInfo {
  /** Minutes from UTC (e.g. 480 for UTC+8). 0 fallback. */
  offsetMinutes: number;
  /** ms when this snapshot was taken. */
  fetchedAt: number;
}
let tzCache: ServerTzInfo | null = null;
const TZ_TTL_MS = 60_000;

const TIME_INFO_QUERY = /* GraphQL */ `
  query HorizonAlarmsTime {
    time: getTimeInfo {
      timezone
      currentTimestamp
    }
  }
`;

async function getServerOffsetMinutes(
  config: ConfigSource,
  fetchImpl?: FetchLike,
): Promise<number> {
  const now = Date.now();
  if (tzCache && now - tzCache.fetchedAt < TZ_TTL_MS) return tzCache.offsetMinutes;
  try {
    const got = await graphqlPost<{ time?: { timezone?: string | null } | null }>(
      buildOapOpts(config.current, fetchImpl),
      TIME_INFO_QUERY,
    );
    const raw = got.time?.timezone ?? '+0000';
    // Format `±HHmm`, e.g. `+0800` for UTC+8.
    const m = /^([+-])(\d{2})(\d{2})$/.exec(raw);
    if (m) {
      const sign = m[1] === '-' ? -1 : 1;
      const h = parseInt(m[2], 10);
      const mi = parseInt(m[3], 10);
      const offset = sign * (h * 60 + mi);
      tzCache = { offsetMinutes: offset, fetchedAt: now };
      return offset;
    }
  } catch {
    /* fall through to 0 */
  }
  tzCache = { offsetMinutes: 0, fetchedAt: now };
  return 0;
}

/** Format an epoch-ms into OAP's `yyyy-MM-dd HHmm` (MINUTE granularity)
 *  in the server's timezone. */
function fmtMinute(epochMs: number, offsetMinutes: number): string {
  const shifted = new Date(epochMs + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}${mi}`;
}

/** Format an epoch-ms into OAP's `yyyy-MM-dd HHmmss` (SECOND
 *  granularity). Used for the alarms query so the window includes
 *  alarms that fire in the current minute — MINUTE-precision rounds
 *  the end down and chops them off. */
function fmtSecond(epochMs: number, offsetMinutes: number): string {
  const shifted = new Date(epochMs + offsetMinutes * 60_000);
  const y = shifted.getUTCFullYear();
  const mo = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  const h = String(shifted.getUTCHours()).padStart(2, '0');
  const mi = String(shifted.getUTCMinutes()).padStart(2, '0');
  const s = String(shifted.getUTCSeconds()).padStart(2, '0');
  return `${y}-${mo}-${d} ${h}${mi}${s}`;
}

function safeFloat(v: string | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Minutes between two MINUTE-rounded epochs (inclusive endpoints). */
function bucketCount(startMs: number, endMs: number): number {
  return Math.max(1, Math.round((endMs - startMs) / 60_000) + 1);
}

function buildTimeline(startMs: number, endMs: number): number[] {
  const n = bucketCount(startMs, endMs);
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(startMs + i * 60_000);
  return out;
}

// ── GraphQL queries ───────────────────────────────────────────────────

/* `events` is deliberately OMITTED — demo OAP (and likely any OAP
 *  backed by some storage variants) throws `java.io.IOException:
 *  fail to query stream` when the events resolver streams per-alarm
 *  events alongside a 30-row alarm list. The snapshot already
 *  carries everything the detail panel needs (expression + the MQE
 *  values that crossed threshold). When per-alarm events are needed
 *  later, fetch them via a separate keyword-filtered call against
 *  this same endpoint, or via the Events query directly. */
const GET_ALARM_QUERY = /* GraphQL */ `
  query HorizonGetAlarm(
    $duration: Duration!
    $scope: Scope
    $keyword: String
    $paging: Pagination!
    $tags: [AlarmTag]
  ) {
    getAlarm(duration: $duration, scope: $scope, keyword: $keyword, paging: $paging, tags: $tags) {
      msgs {
        id
        startTime
        recoveryTime
        scope
        name
        message
        tags { key value }
        snapshot {
          expression
          metrics {
            name
            results {
              metric { labels { key value } }
              values { id value traceID }
            }
          }
        }
      }
    }
  }
`;

const LIST_SERVICES_QUERY = /* GraphQL */ `
  query HorizonAlarmServices($layer: String!) {
    listServices(layer: $layer) { name normal }
  }
`;

interface ListServicesRaw {
  listServices: Array<{ name: string; normal: boolean | null }>;
}

interface GetAlarmRaw {
  getAlarm?: { msgs?: AlarmMessage[] } | null;
}

// ── Routes ───────────────────────────────────────────────────────────

const alarmsQuerySchema = z.object({
  startTime: z.coerce.number().int().positive(),
  endTime: z.coerce.number().int().positive(),
  scope: z.string().optional(),
  keyword: z.string().optional(),
  pageNum: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(100),
  service: z.string().optional(),
  instance: z.string().optional(),
  endpoint: z.string().optional(),
});

const trafficQuerySchema = z.object({
  startTime: z.coerce.number().int().positive(),
  endTime: z.coerce.number().int().positive(),
});

const configSaveSchema = z.object({
  trafficLayers: z
    .array(
      z.object({
        layerKey: z.string().min(1),
        mqe: z.string().min(1),
        label: z.string().optional(),
      }).strict(),
    )
    .max(8),
});

export function registerAlarmsRoutes(app: FastifyInstance, deps: AlarmsRouteDeps): void {
  const auth = requireAuth(deps);
  const serviceLayer = new ServiceLayerMap({ config: deps.config, fetch: deps.fetch });

  // ── GET /api/alarms ────────────────────────────────────────────────
  app.get('/api/alarms', { preHandler: auth }, async (req: FastifyRequest, reply: FastifyReply) => {
    const parsed = alarmsQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
    }
    const q = parsed.data;
    if (q.endTime <= q.startTime) return badRequest('endTime must be greater than startTime');

    const offset = await getServerOffsetMinutes(deps.config, deps.fetch);
    // SECOND-precision duration window. Booster-ui uses SECOND here
    // and it's the right call: MINUTE-rounding the end excludes any
    // alarm whose startTime is in the current/upcoming minute, which
    // for OAP installs that emit alarms continuously means the UI
    // perpetually misses the most-recent firing. Per-second precision
    // keeps the latest alarm in the window.
    const start = fmtSecond(q.startTime, offset);
    const end = fmtSecond(q.endTime, offset);

    const opts = buildOapOpts(deps.config.current, deps.fetch);
    const variables: Record<string, unknown> = {
      duration: { start, end, step: 'SECOND' },
      paging: { pageNum: q.pageNum, pageSize: q.pageSize },
    };
    if (q.scope) variables.scope = q.scope;
    if (q.keyword) variables.keyword = q.keyword;

    let raw: GetAlarmRaw;
    try {
      raw = await graphqlPost<GetAlarmRaw>(opts, GET_ALARM_QUERY, variables);
    } catch (err) {
      return reply.code(502).send({
        error: 'oap_unreachable',
        message: err instanceof Error ? err.message : String(err),
      });
    }
    const msgsRaw = raw.getAlarm?.msgs ?? [];

    // Service-name → layer tag (best-effort, see service-layer-map docs).
    const layerIdx = await serviceLayer.get();

    // Post-filter — OAP doesn't expose service/instance/endpoint filters
    // on `getAlarm` directly, so we filter the page client-side. The
    // page-size cap (200) keeps this O(pageSize).
    const filtered = msgsRaw.filter((m) => {
      if (q.service && !m.name.toLowerCase().includes(q.service.toLowerCase())) return false;
      if (q.instance && !m.name.toLowerCase().includes(q.instance.toLowerCase())) return false;
      if (q.endpoint && !m.name.toLowerCase().includes(q.endpoint.toLowerCase())) return false;
      return true;
    });

    const tagged: AlarmMessage[] = filtered.map((m) => {
      // Entity name on `Service` scope is the service name directly;
      // on `ServiceInstance` / `Endpoint` the wire packs the service
      // name as a prefix before a separator — try the literal name
      // first, then strip after common separators.
      const candidates = [m.name, m.name.split('::')[0], m.name.split(' ')[0]];
      let layerKey: string | null = null;
      for (const cand of candidates) {
        const hit = layerIdx.byName.get(cand.toLowerCase());
        if (hit) {
          layerKey = hit;
          break;
        }
      }
      return { ...m, layerKey };
    });

    const body: AlarmsResponse = {
      total: tagged.length,
      pageNum: q.pageNum,
      pageSize: q.pageSize,
      generatedAt: Date.now(),
      msgs: tagged,
    };
    return reply.send(body);
  });

  // ── GET /api/alarms/traffic ────────────────────────────────────────
  app.get(
    '/api/alarms/traffic',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = trafficQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_query', detail: parsed.error.flatten() });
      }
      const q = parsed.data;
      if (q.endTime <= q.startTime) return badRequest('endTime must be greater than startTime');

      // Round to minute boundaries to match the OAP MINUTE step.
      const startMs = Math.floor(q.startTime / 60_000) * 60_000;
      const endMs = Math.floor(q.endTime / 60_000) * 60_000;

      const offset = await getServerOffsetMinutes(deps.config, deps.fetch);
      const start = fmtMinute(startMs, offset);
      const end = fmtMinute(endMs, offset);
      const timeline = buildTimeline(startMs, endMs);

      const cfg = await deps.store.load();
      const opts = buildOapOpts(deps.config.current, deps.fetch);

      const series: AlarmTrafficSeries[] = await Promise.all(
        cfg.trafficLayers.map<Promise<AlarmTrafficSeries>>(async (L) => {
          const label = L.label ?? prettyLayer(L.layerKey);
          // 1) list services in the layer.
          let services: Array<{ name: string; normal: boolean | null }>;
          try {
            const ls = await graphqlPost<ListServicesRaw>(opts, LIST_SERVICES_QUERY, {
              layer: L.layerKey,
            });
            services = Array.isArray(ls.listServices) ? ls.listServices : [];
          } catch (err) {
            return {
              layerKey: L.layerKey,
              label,
              present: false,
              points: timeline.map((ts) => ({ ts, value: null })),
              error: err instanceof Error ? err.message : String(err),
            };
          }
          if (services.length === 0) {
            return {
              layerKey: L.layerKey,
              label,
              present: false,
              points: timeline.map((ts) => ({ ts, value: null })),
            };
          }

          // 2) fan out MQE for each service. Cap at 40 services to
          //    bound the upstream graphql blast — the alarms timeline
          //    is a glanceable backdrop, not a precise dashboard.
          const cap = 40;
          const sliced = services.slice(0, cap);
          const aliased = sliced
            .map(
              (s, i) =>
                `s${i}: execExpression(\n` +
                `      expression: ${JSON.stringify(L.mqe)},\n` +
                `      entity: { scope: Service, serviceName: ${JSON.stringify(s.name)}, normal: ${s.normal === false ? 'false' : 'true'} },\n` +
                `      duration: { start: ${JSON.stringify(start)}, end: ${JSON.stringify(end)}, step: MINUTE }\n` +
                `    ) { type error results { values { value } } }`,
            )
            .join('\n');
          const query = `query HorizonAlarmTrafficLayer { ${aliased} }`;
          let data: Record<string, { error?: string | null; results?: Array<{ values: Array<{ value: string | null }> }> }>;
          try {
            data = await graphqlPost(opts, query);
          } catch (err) {
            return {
              layerKey: L.layerKey,
              label,
              present: false,
              points: timeline.map((ts) => ({ ts, value: null })),
              error: err instanceof Error ? err.message : String(err),
            };
          }
          // 3) Sum per-bucket across services.
          const summed: Array<number | null> = timeline.map(() => null);
          for (let i = 0; i < sliced.length; i++) {
            const row = data[`s${i}`];
            const values = row?.results?.[0]?.values ?? [];
            for (let b = 0; b < timeline.length; b++) {
              const v = safeFloat(values[b]?.value);
              if (v === null) continue;
              summed[b] = (summed[b] ?? 0) + v;
            }
          }
          return {
            layerKey: L.layerKey,
            label,
            present: true,
            points: timeline.map((ts, i) => ({ ts, value: summed[i] })),
          };
        }),
      );

      const body: AlarmTrafficResponse = {
        generatedAt: Date.now(),
        startTime: startMs,
        endTime: endMs,
        step: 'MINUTE',
        series,
      };
      return reply.send(body);
    },
  );

  // ── GET /api/alarms/services?layer=X ──────────────────────────────
  // Cascading-filter helper for the alarms page. Returns the service
  // roster for one OAP layer in alpha order so the UI can populate
  // a dropdown without re-implementing the listServices wire. The
  // instance + endpoint pickers reuse the existing
  // /api/layer/:key/instances and /api/layer/:key/endpoints endpoints.
  app.get(
    '/api/alarms/services',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const layer = (req.query as { layer?: string } | undefined)?.layer;
      if (!layer || typeof layer !== 'string') {
        return reply.code(400).send({ error: 'missing_layer' });
      }
      const opts = buildOapOpts(deps.config.current, deps.fetch);
      try {
        const got = await graphqlPost<ListServicesRaw>(opts, LIST_SERVICES_QUERY, { layer });
        const services = (got.listServices ?? [])
          .filter((s) => typeof s?.name === 'string' && s.name.length > 0)
          .sort((a, b) => a.name.localeCompare(b.name));
        return reply.send({ layer, services });
      } catch (err) {
        return reply.code(502).send({
          error: 'oap_unreachable',
          message: err instanceof Error ? err.message : String(err),
        });
      }
    },
  );

  // ── GET /api/alarms/config ─────────────────────────────────────────
  app.get(
    '/api/alarms/config',
    { preHandler: auth },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const cfg = await deps.store.load();
      return reply.send(cfg);
    },
  );

  // ── POST /api/alarms/config ────────────────────────────────────────
  app.post(
    '/api/alarms/config',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = configSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_body', detail: parsed.error.flatten() });
      }
      const next: AlarmsConfig = { trafficLayers: parsed.data.trafficLayers };
      await deps.store.save(next);
      serviceLayer.invalidate();
      deps.audit.record({
        action: 'alarms.config.save',
        actor: req.session?.username ?? null,
        outcome: 'ok',
        details: { layers: next.trafficLayers.map((l) => `${l.layerKey}:${l.mqe}`) },
        fromIp: req.ip,
        sessionId: req.session?.sid,
      });
      return reply.send(next);
    },
  );
}

function prettyLayer(key: string): string {
  return key
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}
