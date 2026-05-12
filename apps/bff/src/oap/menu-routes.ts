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

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  FetchLike,
  LayerCaps,
  LayerDef,
  LayerSlots,
  MenuResponse,
} from '@skywalking-horizon-ui/api-client';
import type { ConfigSource } from '../config/loader.js';
import type { SessionStore } from '../auth/sessions.js';
import { requireAuth } from '../auth/middleware.js';
import { graphqlPost } from './graphql-client.js';

export interface MenuRouteDeps {
  config: ConfigSource;
  sessions: SessionStore;
  fetch?: FetchLike;
}

// One round-trip, three aliased queries.
const MENU_QUERY = /* GraphQL */ `
  query HorizonMenu {
    layers: listLayers
    items: getMenuItems {
      title
      icon
      layer
      activate
      description
      documentLink
      i18nKey
    }
    levels: listLayerLevels {
      layer
      level
    }
  }
`;

/**
 * Legacy enum values OAP keeps for backward compatibility — collapse to the
 * modern equivalent so the sidebar shows one row per logical layer.
 */
const LAYER_ALIAS: Record<string, string> = {
  CACHE: 'VIRTUAL_CACHE',
  DATABASE: 'VIRTUAL_DATABASE',
  MQ: 'VIRTUAL_MQ',
  GENAI: 'VIRTUAL_GENAI',
};

function canonical(layer: string): string {
  return LAYER_ALIAS[layer] ?? layer;
}

interface MenuRaw {
  layers: string[];
  items: Array<{
    title: string;
    icon?: string | null;
    layer: string;
    activate?: boolean | null;
    description?: string | null;
    documentLink?: string | null;
    i18nKey?: string | null;
  }>;
  levels: Array<{ layer: string; level: number }>;
}

/**
 * Horizon-side defaults for per-layer term aliases and color. OAP doesn't
 * expose these — they live alongside the UI's sidebar config. Operators can
 * override via `horizon.yaml.layers.<key>` (future Phase 7 admin).
 *
 * Keys match `Layer.name` in OAP's enum (UPPER_SNAKE_CASE).
 */
const LAYER_DEFAULTS: Record<string, { color: string; slots: LayerSlots; caps: LayerCaps }> = {
  GENERAL: {
    color: 'var(--sw-accent)',
    slots: { services: 'Services', instances: 'Instances', endpoints: 'API', endpointDependency: 'API dependency' },
    caps: {
      serviceMap: true, endpointDependency: true, instanceTopology: true, processTopology: true,
      dashboards: true, traces: true, logs: true, profiling: true, events: true,
    },
  },
  MESH: {
    color: 'var(--sw-info)',
    slots: { services: 'Services', instances: 'Sidecars', endpoints: 'Endpoints' },
    caps: {
      serviceMap: true, endpointDependency: true, instanceTopology: true,
      dashboards: true, traces: true, logs: true, events: true,
    },
  },
  MESH_CP: { color: 'var(--sw-info)', slots: { services: 'Control-plane services' }, caps: { dashboards: true } },
  MESH_DP: { color: 'var(--sw-info)', slots: { services: 'Data-plane services', instances: 'Sidecars' }, caps: { dashboards: true, instanceTopology: true } },
  K8S: { color: 'var(--sw-purple)', slots: { services: 'Workloads', instances: 'Pods' }, caps: { serviceMap: true, instanceTopology: true, dashboards: true, events: true } },
  K8S_SERVICE: { color: 'var(--sw-purple)', slots: { services: 'K8s services', instances: 'Pods' }, caps: { serviceMap: true, instanceTopology: true, dashboards: true } },
  BROWSER: { color: 'var(--sw-cyan)', slots: { services: 'Applications', instances: 'Versions', endpoints: 'Pages' }, caps: { dashboards: true, traces: true, logs: true } },
  MYSQL: { color: 'var(--sw-warn)', slots: { services: 'Instances' }, caps: { dashboards: true } },
  POSTGRESQL: { color: 'var(--sw-warn)', slots: { services: 'Instances' }, caps: { dashboards: true } },
  ELASTICSEARCH: { color: 'var(--sw-warn)', slots: { services: 'Clusters', instances: 'Nodes' }, caps: { dashboards: true } },
  REDIS: { color: 'var(--sw-warn)', slots: { services: 'Instances' }, caps: { dashboards: true } },
  MONGODB: { color: 'var(--sw-warn)', slots: { services: 'Clusters', instances: 'Nodes' }, caps: { dashboards: true } },
  CLICKHOUSE: { color: 'var(--sw-warn)', slots: { services: 'Services', instances: 'Instances' }, caps: { dashboards: true } },
  KAFKA: { color: 'var(--sw-ok)', slots: { services: 'Clusters', instances: 'Brokers' }, caps: { dashboards: true } },
  PULSAR: { color: 'var(--sw-ok)', slots: { services: 'Clusters', instances: 'Brokers' }, caps: { dashboards: true } },
  ROCKETMQ: { color: 'var(--sw-ok)', slots: { services: 'Clusters', instances: 'Brokers', endpoints: 'Topics' }, caps: { dashboards: true } },
  RABBITMQ: { color: 'var(--sw-ok)', slots: { services: 'Clusters', instances: 'Nodes' }, caps: { dashboards: true } },
  ACTIVEMQ: { color: 'var(--sw-ok)', slots: { services: 'Clusters', instances: 'Brokers', endpoints: 'Destinations' }, caps: { dashboards: true } },
  VIRTUAL_DATABASE: { color: 'var(--sw-warn)', slots: { services: 'Databases' }, caps: { dashboards: true } },
  VIRTUAL_CACHE: { color: 'var(--sw-warn)', slots: { services: 'Caches' }, caps: { dashboards: true } },
  VIRTUAL_MQ: { color: 'var(--sw-ok)', slots: { services: 'Queues' }, caps: { dashboards: true } },
  VIRTUAL_GENAI: { color: 'var(--sw-purple)', slots: { services: 'Providers', instances: 'Models' }, caps: { dashboards: true } },
};

const DEFAULT_FOR_UNKNOWN_LAYER = {
  color: 'var(--sw-fg-2)',
  slots: { services: 'Services' } as LayerSlots,
  caps: {dashboards: true } as LayerCaps,
};

function deriveLayer(
  rawKey: string,
  active: boolean,
  level: number | null,
  serviceCount: number,
  items: MenuRaw['items'],
): LayerDef {
  const item = items.find((i) => canonical(i.layer) === rawKey);
  const def = LAYER_DEFAULTS[rawKey] ?? DEFAULT_FOR_UNKNOWN_LAYER;
  return {
    key: rawKey.toLowerCase(),
    name: item?.title?.trim() || rawKey.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
    color: def.color,
    serviceCount,
    active,
    level,
    documentLink: item?.documentLink ?? undefined,
    slots: def.slots,
    caps: def.caps,
  };
}

/**
 * Fetch per-layer service counts in a single GraphQL request with aliased
 * `listServices(layer)` queries (one alias per active layer). Returns a
 * map keyed by the layer's RAW (pre-canonical) name.
 */
async function fetchCountsForLayers(
  layers: readonly string[],
  opts: { statusUrl: string; timeoutMs: number; fetch?: FetchLike },
): Promise<Map<string, number>> {
  const map = new Map<string, number>();
  if (layers.length === 0) return map;
  // GraphQL aliases must be valid identifiers — index-keyed.
  const aliased = layers
    .map((l, i) => `_${i}: listServices(layer: ${JSON.stringify(l)}) { id }`)
    .join('\n');
  const query = `query HorizonCounts { ${aliased} }`;
  try {
    const data = await graphqlPostShim<Record<string, Array<{ id: string }>>>(opts, query);
    layers.forEach((l, i) => map.set(l, (data[`_${i}`] ?? []).length));
  } catch {
    // Soft-fail: leave the map empty so deriveLayer falls back to -1.
  }
  return map;
}

// Local re-import to avoid a circular dep — graphqlPost is in the same dir.
import { graphqlPost as graphqlPostShim } from './graphql-client.js';

export function registerMenuRoute(app: FastifyInstance, deps: MenuRouteDeps): void {
  const auth = requireAuth(deps);
  app.get('/api/menu', { preHandler: auth }, async (_req: FastifyRequest, reply: FastifyReply) => {
    const cfg = deps.config.current;
    const statusUrl = cfg.oap.statusUrl;
    const opts = { statusUrl, timeoutMs: cfg.oap.timeoutMs, fetch: deps.fetch };
    try {
      const raw = await graphqlPost<MenuRaw>(opts, MENU_QUERY);

      // Active list collapsed by alias (CACHE → VIRTUAL_CACHE, etc.).
      const activeCanonical = new Set(raw.layers.map(canonical));
      const levelByCanonical = new Map(raw.levels.map((l) => [canonical(l.layer), l.level]));

      // Service-count batch — uses the RAW layer names from OAP since the
      // alias collapse is only a presentation concern.
      const counts = await fetchCountsForLayers(raw.layers, opts);
      const countByCanonical = new Map<string, number>();
      for (const rawLayer of raw.layers) {
        const key = canonical(rawLayer);
        countByCanonical.set(key, (countByCanonical.get(key) ?? 0) + (counts.get(rawLayer) ?? 0));
      }

      // Catalog order = the order OAP returned `getMenuItems` (mirrors
      // menu.yaml). Active-only keys not in the catalog get appended at
      // the end so nothing disappears.
      const ordered: string[] = [];
      const seen = new Set<string>();
      for (const item of raw.items) {
        if (!item.layer) continue;
        const k = canonical(item.layer);
        if (seen.has(k)) continue;
        seen.add(k);
        ordered.push(k);
      }
      for (const rawLayer of raw.layers) {
        const k = canonical(rawLayer);
        if (seen.has(k)) continue;
        seen.add(k);
        ordered.push(k);
      }

      const layers = ordered.map((key) =>
        deriveLayer(
          key,
          activeCanonical.has(key),
          levelByCanonical.has(key) ? (levelByCanonical.get(key) ?? null) : null,
          countByCanonical.get(key) ?? (activeCanonical.has(key) ? 0 : -1),
          raw.items,
        ),
      );

      const body: MenuResponse = {
        layers,
        generatedAt: Date.now(),
        oap: { reachable: true, statusUrl },
      };
      return reply.send(body);
    } catch (err) {
      const body: MenuResponse = {
        layers: [],
        generatedAt: Date.now(),
        oap: {
          reachable: false,
          statusUrl,
          error: err instanceof Error ? err.message : String(err),
        },
      };
      return reply.status(200).send(body); // soft-fail so the UI shows a banner, not a 5xx
    }
  });
}
