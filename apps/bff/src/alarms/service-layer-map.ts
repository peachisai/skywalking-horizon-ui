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
 * Service-name → layer-key index used by the alarms route to tag each
 * AlarmMessage with the layer it belongs to. OAP's alarm wire only
 * carries `scope` (Service / Instance / Endpoint) and `name` (the
 * entity name); the layer is derived from the service-name lookup.
 *
 * Refresh on demand with a 60s TTL — service rosters move slowly
 * enough that staleness for a minute is fine, and it spares OAP from
 * a `listServices` fan-out on every alarms poll.
 */

import { buildOapOpts, graphqlPost } from '../oap/graphql-client.js';
import type { ConfigSource } from '../config/loader.js';
import type { FetchLike } from '@skywalking-horizon-ui/api-client';
import { logger } from '../logger.js';

interface ServiceLayerMapDeps {
  config: ConfigSource;
  fetch?: FetchLike;
}

interface ListResult {
  layers: string[];
  /** Lower-case service name → canonical layer key. Multiple layers
   *  for the same name collapse to the last one seen — operators
   *  shouldn't be running the same service name across layers, but
   *  if they do, the layer tag becomes best-effort. */
  byName: Map<string, string>;
}

const LAYERS_QUERY = /* GraphQL */ `
  query HorizonAlarmsLayers {
    layers: listLayers
  }
`;

interface LayersRaw {
  layers: string[];
}

function fragment(idx: number, layer: string): string {
  return `_${idx}: listServices(layer: ${JSON.stringify(layer)}) { name }`;
}

interface ServiceRow {
  name: string;
}

export class ServiceLayerMap {
  private cached: ListResult | null = null;
  private lastFetchAt = 0;
  private inflight: Promise<ListResult> | null = null;
  /** ms */
  private readonly ttl = 60_000;

  constructor(private readonly deps: ServiceLayerMapDeps) {}

  async get(): Promise<ListResult> {
    const now = Date.now();
    if (this.cached && now - this.lastFetchAt < this.ttl) return this.cached;
    if (this.inflight) return this.inflight;
    this.inflight = this.refresh()
      .then((r) => {
        this.cached = r;
        this.lastFetchAt = Date.now();
        return r;
      })
      .finally(() => {
        this.inflight = null;
      });
    return this.inflight;
  }

  /** Force a refresh on the next `get()`. Called after the alarms-config
   *  layer list changes — the new layer might not be in the existing
   *  cache. */
  invalidate(): void {
    this.cached = null;
    this.lastFetchAt = 0;
  }

  private async refresh(): Promise<ListResult> {
    const cfg = this.deps.config.current;
    const opts = buildOapOpts(cfg, this.deps.fetch);
    let layers: string[];
    try {
      const got = await graphqlPost<LayersRaw>(opts, LAYERS_QUERY);
      layers = Array.isArray(got.layers) ? got.layers : [];
    } catch (err) {
      logger.warn({ err }, 'alarms service-layer-map: listLayers failed');
      return { layers: [], byName: new Map() };
    }
    if (layers.length === 0) return { layers, byName: new Map() };
    const aliased = layers.map((l, i) => fragment(i, l)).join('\n');
    const query = `query HorizonAlarmsServices { ${aliased} }`;
    try {
      const data = await graphqlPost<Record<string, ServiceRow[]>>(opts, query);
      const byName = new Map<string, string>();
      layers.forEach((layer, i) => {
        const rows = data[`_${i}`] ?? [];
        for (const row of rows) {
          if (row?.name) byName.set(row.name.toLowerCase(), layer);
        }
      });
      return { layers, byName };
    } catch (err) {
      logger.warn({ err }, 'alarms service-layer-map: listServices fan-out failed');
      return { layers, byName: new Map() };
    }
  }
}
