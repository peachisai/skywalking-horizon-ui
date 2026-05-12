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

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DashboardWidget } from '@skywalking-horizon-ui/api-client';

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
  /** Default order-by metric key for the topN service ranking. */
  orderBy?: string;
  /** Throughput metric key (drives the per-layer KPI tile + spark). */
  throughput?: string;
  /** Spark metric key (defaults to `throughput` when omitted). */
  spark?: string;
  columns?: LayerMetricColumn[];
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
  widgets: DashboardWidget[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_DIR = join(__dirname, 'config');

let cache: Map<string, LayerTemplate> | null = null;

function load(): Map<string, LayerTemplate> {
  const out = new Map<string, LayerTemplate>();
  for (const file of readdirSync(CONFIG_DIR)) {
    if (!file.endsWith('.json')) continue;
    const raw = readFileSync(join(CONFIG_DIR, file), 'utf-8');
    let parsed: LayerTemplate;
    try {
      parsed = JSON.parse(raw) as LayerTemplate;
    } catch (err) {
      throw new Error(`failed to parse layer config ${file}: ${err instanceof Error ? err.message : err}`);
    }
    // File name should match the layer key (case-insensitive) so the
    // operator can rename / locate the right file without grepping JSON.
    const expected = basename(file, '.json').toUpperCase();
    if (parsed.key && parsed.key.toUpperCase() !== expected) {
      throw new Error(
        `layer config ${file}: file basename does not match \`key\` (${parsed.key})`,
      );
    }
    out.set(parsed.key.toUpperCase(), parsed);
  }
  return out;
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
