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

import type {
  DashboardConfig,
  DashboardResponse,
  DashboardWidget,
  EndpointDependencyResponse,
  LandingConfig,
  LandingResponse,
  TopologyResponse,
} from '@skywalking-horizon-ui/api-client';
import type { BffClient } from '../client';

/** `bff.layer` — per-layer data: landing top-N, dashboard widgets,
 *  endpoint / instance pickers, topology, endpoint dependency. */
export class LayerApi {
  constructor(private readonly bff: BffClient) {}

  landing(
    layerKey: string,
    cfg: LandingConfig,
    range?: { step: 'MINUTE' | 'HOUR' | 'DAY'; startMs: number; endMs: number },
  ): Promise<LandingResponse> {
    const body: Record<string, unknown> = {
      topN: cfg.topN,
      orderBy: cfg.orderBy,
      columns: cfg.columns,
      ...(cfg.spark ? { spark: cfg.spark } : {}),
      ...(cfg.throughput ? { throughput: cfg.throughput } : {}),
    };
    if (range) {
      body.step = range.step;
      body.startMs = range.startMs;
      body.endMs = range.endMs;
    }
    return this.bff.request<LandingResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/landing`,
      body,
    );
  }

  dashboardConfig(layerKey: string, scope?: string): Promise<DashboardConfig> {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return this.bff.request<DashboardConfig>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/dashboard/config${qs}`,
    );
  }

  dashboard(
    layerKey: string,
    body: {
      service?: string;
      /** Active instance — only honored when `scope === 'instance'`. */
      serviceInstance?: string;
      /** Active endpoint — only honored when `scope === 'endpoint'`. */
      endpoint?: string;
      widgets?: DashboardWidget[];
      scope?: string;
      step?: 'MINUTE' | 'HOUR' | 'DAY';
      /** Range start ms. Paired with `endMs` + `step`. */
      startMs?: number;
      /** Range end ms. */
      endMs?: number;
    } = {},
    /** Dev-mode `?mockTop=N` — pad every TopList result to N synthetic rows. */
    opts: { mockTop?: number } = {},
  ): Promise<DashboardResponse> {
    const qs = opts.mockTop && opts.mockTop > 0 ? `?mockTop=${opts.mockTop}` : '';
    return this.bff.request<DashboardResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/dashboard${qs}`,
      body,
    );
  }

  endpoints(
    layerKey: string,
    service: string,
    query: string,
    limit = 20,
  ): Promise<{
    layer: string;
    service: string;
    query: string;
    limit: number;
    generatedAt: number;
    endpoints: Array<{ id: string; name: string }>;
    reachable: boolean;
    error?: string;
  }> {
    const qs = new URLSearchParams({ service, q: query, limit: String(limit) });
    return this.bff.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/endpoints?${qs.toString()}`,
    );
  }

  instances(
    layerKey: string,
    service: string,
  ): Promise<{
    layer: string;
    service: string;
    generatedAt: number;
    instances: Array<{
      id: string;
      name: string;
      language: string | null;
      attributes: Array<{ name: string; value: string }>;
    }>;
    reachable: boolean;
    error?: string;
  }> {
    const qs = `?service=${encodeURIComponent(service)}`;
    return this.bff.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/instances${qs}`,
    );
  }

  topology(layerKey: string, service?: string, depth = 1): Promise<TopologyResponse> {
    const qs = new URLSearchParams();
    if (service) qs.set('service', service);
    qs.set('depth', String(depth));
    return this.bff.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/topology?${qs.toString()}`,
    );
  }

  endpointDependency(
    layerKey: string,
    service: string,
    endpoint: string,
  ): Promise<EndpointDependencyResponse> {
    const qs = new URLSearchParams({ service, endpoint });
    return this.bff.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/endpoint-dependency?${qs.toString()}`,
    );
  }
}
