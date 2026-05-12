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
 * Wire types for `GET /api/menu`. The BFF aliases three OAP GraphQL queries
 * (`listLayers`, `getMenuItems`, `listLayerLevels`) into a single roundtrip
 * and stitches the result into the shape below — same as what the sidebar
 * (`apps/ui/src/components/shell/layers.ts`) renders.
 *
 * `caps` flags reflect what the LAYER supports; the UI hides rows whose
 * cap is false. `slots` carries per-layer term aliases (e.g. General's
 * endpoint → "API"). Layer-level overrides (term aliases, menu mode) live
 * in `horizon.yaml` and per-user state — the BFF merges all three sources.
 */

export interface LayerSlots {
  /** Renamed service-equivalent (functions / workloads / clusters / apps / databases / virtual service / …). */
  services?: string;
  /** Renamed instance-equivalent (versions / pods / brokers / sessions / nodes / …). */
  instances?: string;
  /** Renamed endpoint-equivalent. "API" for General, "Topics" for MQ, "Pages" for Browser. */
  endpoints?: string;
  /** Label for the endpoint-to-endpoint dependency feature. Defaults to `${endpoints} dependency`. */
  endpointDependency?: string;
}

export interface LayerCaps {
  serviceMap?: boolean;
  endpointDependency?: boolean;
  instanceTopology?: boolean;
  processTopology?: boolean;
  dashboards?: boolean;
  traces?: boolean;
  logs?: boolean;
  profiling?: boolean;
  events?: boolean;
}

export interface LayerDef {
  key: string;
  /** Display name from OAP `getMenuItems.title` (preserving casing). */
  name: string;
  /** Hex / CSS color from horizon-side defaults; OAP doesn't provide one. */
  color: string;
  /** From `listServices(layer)` count; -1 if the BFF couldn't reach OAP. */
  serviceCount: number;
  /** True iff OAP returned this layer in `listLayers` (services reporting). */
  active: boolean;
  /** Hierarchy level from `listLayerLevels`; null if not in the hierarchy table. */
  level: number | null;
  /** External documentation link from `getMenuItems.documentLink`. */
  documentLink?: string;
  slots: LayerSlots;
  caps: LayerCaps;
}

export interface MenuResponse {
  layers: LayerDef[];
  generatedAt: number;
  /** Best-effort status of the upstream OAP query host. */
  oap: { reachable: boolean; statusUrl: string; error?: string };
}
