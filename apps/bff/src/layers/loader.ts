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
 * Per-layer template config — the source of truth for a layer's
 * presentation (alias, color, slots, enabled components) AND its data
 * shape (landing card columns, dashboard widgets, MQE expressions).
 *
 * The bundled defaults live under `./config/<key>.json`, one file per
 * OAP layer enum. Operator overrides land in the SetupStore (JSON file
 * on disk) and merge on top.
 *
 * Lifting these from TS code into JSON gets us:
 *   - One file per layer to review or copy
 *   - Operator-editable surface (the future admin/layer-dashboards page
 *     reads + writes JSON-shaped configs)
 *   - Clean separation between code (the loader) and content (the
 *     widget catalog)
 */

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DashboardScope, DashboardWidget } from '@skywalking-horizon-ui/api-client';

export interface LayerComponentFlags {
  service?: boolean;
  instances?: boolean;
  endpoints?: boolean;
  endpointDependency?: boolean;
  topology?: boolean;
  traces?: boolean;
  logs?: boolean;
  profiling?: boolean;
}

export interface LayerSlotsConfig {
  services?: string;
  instances?: string;
  endpoints?: string;
  endpointDependency?: string;
}

export interface LayerMetricColumn {
  metric: string;
  label: string;
  unit?: string;
  mqe?: string;
  aggregation?: 'sum' | 'avg';
  scale?: number;
  precision?: number;
}

export interface LayerMetricsConfig {
  /** Default sort metric for the service list. */
  orderBy?: string;
  columns?: LayerMetricColumn[];
}

/**
 * Overview-tile-only settings. Headline + trend metrics on the
 * per-layer compact tile in the Overview's top strip. Separated
 * from `LayerMetricsConfig` because these settings affect ONLY the
 * Overview page; the service list / per-layer pages don't read them.
 */
export interface LayerOverviewConfig {
  /** Metric key for the Overview tile's big headline value. */
  throughput?: string;
  /** Metric key for the Overview tile's trend line. */
  spark?: string;
}

/**
 * Per-scope dashboards bundled with a layer template. Each scope is an
 * independent widget set; the SPA picks one based on the active route
 * (`/layer/:key/service`, `/instance`, `/endpoint`, `/trace`,
 * `/profiling`). Legacy `widgets` (flat array) is migrated to
 * `dashboards.service` at load time.
 */
export interface LayerDashboards {
  service?: DashboardWidget[];
  instance?: DashboardWidget[];
  endpoint?: DashboardWidget[];
  dependency?: DashboardWidget[];
  topology?: DashboardWidget[];
  trace?: DashboardWidget[];
  logs?: DashboardWidget[];
  profiling?: DashboardWidget[];
}

export interface LayerTemplate {
  /** UPPER_SNAKE enum key (matches OAP). */
  key: string;
  /** Display name override. */
  alias?: string;
  /** Layer-dot color (CSS var or hex). */
  color?: string;
  /** Doc link surfaced as a chip on the layer page. */
  documentLink?: string;
  slots: LayerSlotsConfig;
  components: LayerComponentFlags;
  metrics: LayerMetricsConfig;
  /** Overview-tile only — headline + trend metrics for the Overview's
   *  per-layer compact tile. Optional; falls back to `metrics.orderBy`
   *  for the headline when omitted. */
  overview?: LayerOverviewConfig;
  /** Per-scope widget sets. `service` is the layer's primary landing. */
  dashboards?: LayerDashboards;
  /** Legacy single widget list — treated as `dashboards.service`. */
  widgets?: DashboardWidget[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, 'config');

let cache: Map<string, LayerTemplate> | null = null;

function load(): Map<string, LayerTemplate> {
  const out = new Map<string, LayerTemplate>();
  for (const file of readdirSync(CONFIG_DIR)) {
    if (!file.endsWith('.json')) continue;
    const raw = readFileSync(join(CONFIG_DIR, file), 'utf-8');
    let parsed: LayerTemplate & { alias_terms?: LayerSlotsConfig; alias?: LayerSlotsConfig | string };
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`failed to parse layer config ${file}: ${err instanceof Error ? err.message : err}`);
    }
    const expected = basename(file, '.json').toUpperCase();
    if (parsed.key && parsed.key.toUpperCase() !== expected) {
      throw new Error(
        `layer config ${file}: file basename does not match \`key\` (${parsed.key})`,
      );
    }
    // Schema migration: per-layer entity term overrides used to live
    // under `slots` in the JSON; the more readable `aliases` (plural,
    // distinct from the existing top-level `alias` = layer display
    // name) is now accepted as the primary key. TS code keeps `slots`
    // internally — we normalize here so the rest of the BFF + UI
    // doesn't need to know which the operator wrote.
    const aliases = (parsed as { aliases?: LayerSlotsConfig }).aliases;
    if (!parsed.slots && aliases) {
      parsed.slots = aliases;
    }
    // Migrate legacy `widgets` (flat array) → `dashboards.service` so
    // the rest of the codebase only needs to know about the new shape.
    if (parsed.widgets && (!parsed.dashboards || !parsed.dashboards.service)) {
      parsed.dashboards = { ...parsed.dashboards, service: parsed.widgets };
    }
    // Migrate legacy `metrics.throughput` + `metrics.spark` → top-level
    // `overview` block. Overview-page settings used to live alongside
    // the service-list metric config; they're now split since they
    // affect different pages.
    const legacyMetrics = parsed.metrics as
      | (LayerMetricsConfig & { throughput?: string; spark?: string })
      | undefined;
    if (legacyMetrics && (legacyMetrics.throughput || legacyMetrics.spark)) {
      const ov: LayerOverviewConfig = { ...(parsed.overview ?? {}) };
      if (!ov.throughput && legacyMetrics.throughput) ov.throughput = legacyMetrics.throughput;
      if (!ov.spark && legacyMetrics.spark) ov.spark = legacyMetrics.spark;
      parsed.overview = ov;
      delete legacyMetrics.throughput;
      delete legacyMetrics.spark;
    }
    out.set(parsed.key.toUpperCase(), parsed);
  }
  return out;
}

/** Resolve the widget set for a given scope, falling back to service. */
export function widgetsForScope(
  template: LayerTemplate,
  scope: DashboardScope,
): DashboardWidget[] {
  const d = template.dashboards;
  if (!d) return template.widgets ?? [];
  return d[scope] ?? d.service ?? template.widgets ?? [];
}

/**
 * Persist an operator-edited template back to its JSON file. Validates
 * the basic shape, sorts keys for stable diffs, then refreshes the
 * in-memory cache so subsequent reads see the new state. Intentionally
 * naive: no concurrency control, no schema migrations — operators on
 * single-node BFF deployments, single admin user.
 */
export function writeLayerTemplate(template: LayerTemplate): void {
  if (!template.key || !/^[A-Z][A-Z0-9_]*$/.test(template.key)) {
    throw new Error('invalid template key (must be UPPER_SNAKE_CASE)');
  }
  const file = join(CONFIG_DIR, `${template.key.toLowerCase()}.json`);
  const serialised = JSON.stringify(template, null, 2) + '\n';
  writeFileSync(file, serialised, 'utf-8');
  reloadLayerTemplates();
}

/**
 * Lookup a layer template by enum key (case-insensitive). Returns
 * `null` when no template is defined for the layer — call sites should
 * fall back to a generic shape rather than failing.
 */
export function getLayerTemplate(layerKey: string): LayerTemplate | null {
  if (!cache) cache = load();
  return cache.get(layerKey.toUpperCase()) ?? null;
}

/** All loaded templates, useful for the admin layer-dashboards page. */
export function allLayerTemplates(): LayerTemplate[] {
  if (!cache) cache = load();
  return Array.from(cache.values());
}

/** Force a reload from disk — used by a future admin save endpoint. */
export function reloadLayerTemplates(): void {
  cache = null;
}
