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
 * Overview-dashboard config loader. Reads every `*.json` under
 * `../bundled_templates/overviews/`, validates the wire shape, and keeps
 * the parsed dashboards in-memory. The loader is intentionally eager
 * (all dashboards loaded at boot) — config files are small and the
 * SPA hits dashboard endpoints often enough that on-demand parsing
 * isn't worth the ceremony.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  OverviewDashboard,
  OverviewKpi,
  OverviewVisibility,
  OverviewWidgetType,
} from '@skywalking-horizon-ui/api-client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Bundled overview dashboards live under `bundled_templates/overviews/`
// (sibling to `bundled_templates/layers/`). Co-locating the static
// templates keeps the future "operator-editable / OAP-served" migration
// to one directory swap.
const CONFIG_DIR = path.join(__dirname, '..', 'bundled_templates', 'overviews');

let cache: OverviewDashboard[] | null = null;

function isString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

const WIDGET_TYPES: ReadonlySet<OverviewWidgetType> = new Set([
  'service-count',
  'metric',
  'topology',
  'section-break',
  'kpi-tile',
  'alarms',
  'k8s-summary',
  'pilot-summary',
]);
// `layer` is required for data-bound widgets; layout-only / aggregate
// widgets resolve their data without an explicit layer binding.
const LAYERLESS_WIDGETS: ReadonlySet<OverviewWidgetType> = new Set([
  'section-break',
  'alarms',
]);

function parseKpis(raw: unknown): OverviewKpi[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: OverviewKpi[] = [];
  for (const k of raw) {
    if (!k || typeof k !== 'object') continue;
    const rec = k as Record<string, unknown>;
    if (!isString(rec.label) || !isString(rec.mqe)) continue;
    out.push({
      label: rec.label,
      mqe: rec.mqe,
      unit: isString(rec.unit) ? rec.unit : undefined,
      aggregation:
        rec.aggregation === 'sum' ? 'sum' : rec.aggregation === 'avg' ? 'avg' : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function validate(raw: unknown, file: string): OverviewDashboard | null {
  if (!raw || typeof raw !== 'object') {
    console.warn(`overview/${file}: not an object, skipped`);
    return null;
  }
  const r = raw as Record<string, unknown>;
  if (!isString(r.id) || !isString(r.title) || !Array.isArray(r.widgets)) {
    console.warn(`overview/${file}: missing id/title/widgets`);
    return null;
  }
  const widgets = (r.widgets as unknown[]).filter((w): w is Record<string, unknown> => {
    if (!w || typeof w !== 'object') return false;
    const rec = w as Record<string, unknown>;
    if (!isString(rec.id) || !isString(rec.title)) return false;
    if (!WIDGET_TYPES.has(rec.type as OverviewWidgetType)) return false;
    if (!LAYERLESS_WIDGETS.has(rec.type as OverviewWidgetType) && !isString(rec.layer)) {
      return false;
    }
    return true;
  });
  const visibility: OverviewVisibility | undefined =
    r.visibility === 'operate' ? 'operate' : r.visibility === 'public' ? 'public' : undefined;
  const layers = Array.isArray(r.layers)
    ? (r.layers as unknown[]).filter(isString)
    : undefined;
  return {
    id: r.id,
    title: r.title,
    description: isString(r.description) ? r.description : undefined,
    visibility,
    icon: isString(r.icon) ? r.icon : undefined,
    order: typeof r.order === 'number' ? r.order : undefined,
    layers,
    widgets: widgets.map((w) => ({
      id: w.id as string,
      title: w.title as string,
      tip: isString(w.tip) ? w.tip : undefined,
      layer: isString(w.layer) ? w.layer : undefined,
      type: w.type as OverviewWidgetType,
      mqe: isString(w.mqe) ? w.mqe : undefined,
      unit: isString(w.unit) ? w.unit : undefined,
      aggregation: w.aggregation === 'sum' ? 'sum' : w.aggregation === 'avg' ? 'avg' : undefined,
      cols: typeof w.cols === 'number' ? w.cols : undefined,
      kpis: parseKpis(w.kpis),
      showCount: w.showCount === true ? true : undefined,
      limit: typeof w.limit === 'number' ? w.limit : undefined,
      span: typeof w.span === 'number' ? w.span : undefined,
      rowSpan: typeof w.rowSpan === 'number' ? w.rowSpan : undefined,
    })),
  };
}

/**
 * Load every dashboard config under `../bundled_templates/overviews/*.json`.
 * Memoised after the first call; restart the BFF to pick up file changes
 * (in line with the layer-template loader's behaviour).
 */
export function loadOverviewDashboards(): OverviewDashboard[] {
  if (cache) return cache;
  if (!fs.existsSync(CONFIG_DIR)) {
    cache = [];
    return cache;
  }
  const files = fs.readdirSync(CONFIG_DIR).filter((f) => f.endsWith('.json'));
  const out: OverviewDashboard[] = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(CONFIG_DIR, f), 'utf8'));
      const dash = validate(raw, f);
      if (dash) out.push(dash);
    } catch (err) {
      console.warn(`overview/${f}: parse error`, err instanceof Error ? err.message : err);
    }
  }
  // Stable sort: explicit `order` first, then visibility (public before
  // operate), then id. Operators bumping `order` on a single dashboard
  // shouldn't need to renumber the rest of the bundle.
  out.sort((a, b) => {
    const ao = a.order ?? 1000;
    const bo = b.order ?? 1000;
    if (ao !== bo) return ao - bo;
    const av = a.visibility ?? 'public';
    const bv = b.visibility ?? 'public';
    if (av !== bv) return av === 'public' ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
  cache = out;
  return cache;
}

/** Force a re-read on the next call. Used in tests. */
export function invalidateOverviewCache(): void {
  cache = null;
}

export function getOverviewDashboard(id: string): OverviewDashboard | null {
  return loadOverviewDashboards().find((d) => d.id === id) ?? null;
}
