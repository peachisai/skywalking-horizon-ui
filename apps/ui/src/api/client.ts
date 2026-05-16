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
  EndpointDependencyConfig,
  EndpointDependencyResponse,
  LandingConfig,
  LandingResponse,
  LogFacetsResponse,
  LogQueryRequest,
  LogsResponse,
  MenuResponse,
  OapInfo,
  OverviewDashboardListResponse,
  OverviewDashboardResponse,
  ProfileAnalyzationResponse,
  ProfileAnalyzeQuery,
  ProfileSegmentsResponse,
  ProfileTaskCreationRequest,
  ProfileTaskCreationResponse,
  ProfileTaskListResponse,
  ProfileTaskLogsResponse,
  EBPFTaskListResponse,
  EBPFTaskCreationRequest,
  EBPFTaskCreationResponse,
  EBPFSchedulesResponse,
  EBPFAnalyzeRequest,
  EBPFAnalyzeResponse,
  ProcessTopologyResponse,
  NetworkProfilingCreateRequest,
  NetworkProfilingCreateResponse,
  NetworkProfilingKeepAliveResponse,
  AsyncProfilingTaskListResponse,
  AsyncProfilingTaskCreationRequest,
  AsyncProfilingTaskCreationResponse,
  AsyncProfilingProgressResponse,
  AsyncProfilingAnalyzeResponse,
  PprofTaskListResponse,
  PprofTaskCreationRequest,
  PprofTaskCreationResponse,
  PprofProgressResponse,
  PprofAnalyzeResponse,
  SetupResponse,
  SetupSavePayload,
  TopologyConfig,
  TopologyResponse,
  TraceDetailResponse,
  TraceListResponse,
  TraceQueryOrder,
  TraceQueryState,
  TraceSource,
  TracesConfig,
  ZipkinTraceListResponse,
  ZipkinTraceDetailResponse,
  PreflightResult,
  Catalog,
  RuleSource,
  RuleResponse,
  ApplyResult,
  DeleteMode,
  ListEnvelope,
  BundledEntry,
  OalFilesResponse,
  OalRulesResponse,
  OalSourceDetail,
  StartSessionArgs,
  StartSessionResponse,
  SessionResponse,
  StopSessionResponse,
  ActiveSessionsResponse,
  InspectStep,
  EntitiesResponse,
  InspectExecRequest,
  ExpressionResult,
} from '@skywalking-horizon-ui/api-client';

/** Query shape for `/api/zipkin/traces`. Mirrors the Zipkin v2 REST
 *  params Zipkin's UI uses — all optional, `endTs` defaults to now and
 *  `lookback` to 30 min (ms) server-side. */
export interface ZipkinTraceQuery {
  serviceName?: string;
  remoteServiceName?: string;
  spanName?: string;
  annotationQuery?: string;
  /** microseconds */
  minDuration?: number;
  /** microseconds */
  maxDuration?: number;
  /** ms since epoch */
  endTs?: number;
  /** ms */
  lookback?: number;
  limit?: number;
}

export type {
  MenuResponse,
  LayerDef,
  LayerCaps,
  LayerSlots,
  OapInfo,
  SetupResponse,
  SetupSavePayload,
  LayerConfig,
  LandingConfig,
  LandingColumn,
  LandingResponse,
  LandingServiceRow,
  DashboardConfig,
  DashboardResponse,
  DashboardWidget,
  DashboardWidgetResult,
  TopologyMetricDef,
  TopologyConfig,
  EndpointDependencyConfig,
  TopologyNode,
  TopologyCall,
  TopologyResponse,
  EndpointDependencyNode,
  EndpointDependencyCall,
  EndpointDependencyResponse,
  TraceSource,
  TracesConfig,
  TraceKeyValue,
  TraceLogEntry,
  TraceAttachedEvent,
  TraceRef,
  NativeSpan,
  NativeTraceListRow,
  NativeTraceListResponse,
  NativeTraceDetailResponse,
  TraceQueryOrder,
  TraceQueryState,
  ZipkinEndpoint,
  ZipkinAnnotation,
  ZipkinKind,
  ZipkinSpan,
  ZipkinTraceListRow,
  ZipkinTraceListResponse,
  ZipkinTraceDetailResponse,
  TraceListResponse,
  TraceDetailResponse,
  LogKeyValue,
  LogRow,
  LogTagFilter,
  LogQueryRequest,
  LogsResponse,
  LogFacetsResponse,
  ProfileTask,
  ProfileTaskLog,
  ProfileTaskListResponse,
  ProfileTaskLogsResponse,
  ProfileSpan,
  ProfileSpanRef,
  ProfileSpanTag,
  ProfileSpanLog,
  ProfileSpanLogData,
  ProfileSegment,
  ProfileSegmentsResponse,
  ProfileAnalyzationElement,
  ProfileAnalyzationTree,
  ProfileAnalyzationResponse,
  ProfileTimeRange,
  ProfileAnalyzeQuery,
  ProfileTaskCreationRequest,
  ProfileTaskCreationResponse,
  EBPFTargetType,
  EBPFTriggerType,
  EBPFAggregateType,
  EBPFTask,
  EBPFProcess,
  EBPFSchedule,
  EBPFStackElement,
  EBPFAnalysisTree,
  EBPFTaskCreationRequest,
  EBPFTaskCreationResult,
  EBPFTaskListResponse,
  EBPFSchedulesResponse,
  EBPFAnalyzeRequest,
  EBPFAnalyzeResponse,
  EBPFTaskCreationResponse,
  ProcessNode,
  ProcessCall,
  ProcessTopologyResponse,
  NetworkProfilingSampling,
  NetworkProfilingCreateRequest,
  NetworkProfilingCreateResponse,
  NetworkProfilingKeepAliveResponse,
  AsyncProfilingEvent,
  AsyncJFREventType,
  AsyncProfilingTask,
  AsyncProfilingProgressLog,
  AsyncProfilingProgress,
  AsyncProfilingStackElement,
  AsyncProfilingTree,
  AsyncProfilingTaskCreationRequest,
  AsyncProfilingTaskListResponse,
  AsyncProfilingProgressResponse,
  AsyncProfilingAnalyzeResponse,
  AsyncProfilingTaskCreationResponse,
  PprofTask,
  PprofProgress,
  PprofStackElement,
  PprofTree,
  PprofTaskCreationRequest,
  PprofTaskListResponse,
  PprofProgressResponse,
  PprofAnalyzeResponse,
  PprofTaskCreationResponse,
} from '@skywalking-horizon-ui/api-client';


export interface MeResponse {
  username: string;
  roles: string[];
  verbs: string[];
}

/** Wire shape returned by GET /api/admin/layer-templates. */
export interface AdminLayerTemplate {
  key: string;
  alias?: string;
  color?: string;
  documentLink?: string;
  /** Whether this layer surfaces in the user-facing Layers section
   *  (`public`, default) or in the Operate group's Self-Observability
   *  block (`operate` — OAP / Satellite / agent self-obs). */
  visibility?: 'public' | 'operate';
  slots: { services?: string; instances?: string; endpoints?: string; endpointDependency?: string };
  components: {
    service?: boolean;
    instances?: boolean;
    endpoints?: boolean;
    endpointDependency?: boolean;
    topology?: boolean;
    traces?: boolean;
    logs?: boolean;
    profiling?: boolean;
    traceProfiling?: boolean;
    ebpfProfiling?: boolean;
    asyncProfiling?: boolean;
  };
  metrics: {
    orderBy?: string;
    columns?: Array<{
      metric: string;
      label: string;
      unit?: string;
      mqe?: string;
      aggregation?: 'sum' | 'avg';
      scale?: number;
      precision?: number;
    }>;
  };
  overview?: {
    throughput?: string;
    spark?: string;
  };
  widgets: DashboardWidget[];
  /** Operator-editable service-map config — node + server + client
   *  metric definitions, with optional thresholds. */
  topology?: TopologyConfig;
  /** Operator-editable API-dependency config — node + server-side line
   *  metrics (OAP has no client family for endpoint relations). */
  endpointDependency?: EndpointDependencyConfig;
  /** Per-layer trace source default. */
  traces?: TracesConfig;
  /** Service-name parsing rule for the topology cluster feature.
   *  See `ServiceNamingRule` in @skywalking-horizon-ui/api-client. */
  naming?: {
    pattern: string;
    flags?: string;
    displayGroup?: string;
    valueGroup?: string;
    alias: string;
  };
}

export class BffApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body: unknown) {
    super(message);
    this.name = 'BffApiError';
    this.status = status;
    this.body = body;
  }
}

/** Reduce an unknown thrown value to a short user-facing string.
 *  Knows the {@link BffApiError} envelope (status / body) AND the
 *  upstream `{ status: 'error', code, message }` shape that surfaces
 *  through it. Used by composables that want to display poll / start
 *  failures without each one re-implementing the decoder. */
export function describeApiError(err: unknown): string {
  if (err instanceof BffApiError || (typeof err === 'object' && err !== null && 'status' in err && 'body' in err)) {
    const e = err as { status: number; body: unknown };
    if (typeof e.body === 'object' && e.body !== null) {
      const o = e.body as Record<string, unknown>;
      if (typeof o.code === 'string' && typeof o.message === 'string') {
        return `${e.status} (${o.code}): ${o.message}`;
      }
      if (typeof o.message === 'string') {
        return `${e.status}: ${o.message}`;
      }
      if (typeof o.applyStatus === 'string') {
        return `${e.status} (${o.applyStatus})`;
      }
    }
    if (typeof e.body === 'string' && e.body.length > 0) {
      return `${e.status}: ${e.body}`;
    }
    return `HTTP ${e.status}`;
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

// ── BFF-only response shapes ──────────────────────────────────────────
// These wrap OAP wire types with BFF-side joins (rule attribution,
// per-node fan-out matrices, server-time fallbacks). Kept here rather
// than in @skywalking-horizon-ui/api-client because they're BFF-computed,
// not OAP wire types.

import type {
  DslDebuggingStatus,
  MetricRow,
  RuleStatus,
  LocalState,
} from '@skywalking-horizon-ui/api-client';

/** Per-cluster fan-out of `/dsl-debugging/status` — drives the Live
 *  Debugger health pane. */
export interface ClusterDebugStatus {
  generatedAt: number;
  nodes: { url: string; ok: boolean; status?: DslDebuggingStatus; error?: string }[];
}

/** Per-rule × per-node convergence matrix — the cluster pane reads
 *  this to render the rule grid. */
export interface ClusterRulePerNode {
  status: RuleStatus | null;
  localState: LocalState | null;
  contentHash: string | null;
  lastApplyError: string;
}

export interface ClusterRule {
  catalog: Catalog;
  name: string;
  converged: boolean;
  perNode: Record<string, ClusterRulePerNode>;
}

export interface ClusterStateResponse {
  generatedAt: number;
  nodes: { url: string; ok: boolean; error?: string }[];
  rules: ClusterRule[];
}

/** OAP server-time discovery — sourced from `getTimeInfo` with
 *  fallback to the BFF's local clock when OAP is unreachable. */
export interface InspectServerTimeResponse {
  offsetMinutes: number;
  currentTimestampMillis: number;
  source: 'oap' | 'fallback';
  mqeBaseUrl?: string;
  error?: string;
}

/** Inspect catalog row — `/inspect/metrics` payload joined with the
 *  rule-file each metric was declared in. */
export interface InspectCatalogEntry extends MetricRow {
  attribution: {
    source: 'OAL' | 'MAL·OTEL' | 'MAL·Telegraf' | 'LAL→MAL' | 'unknown';
    file: string | null;
    candidates?: string[];
  };
}

export interface InspectCatalogResponse {
  metrics: InspectCatalogEntry[];
  summary: Record<string, number>;
  attributionFingerprint: string;
}

/** Discovered (or operator-overridden) base URL the BFF uses to fire
 *  MQE `execExpression` mutations. Echoed back to the UI's MQE-target
 *  diagnostic panel. */
export interface InspectMqeTargetResponse {
  baseUrl: string;
  via: string;
  configured: { host?: string; port?: number };
}

type On401 = () => void;

export class BffClient {
  private on401: On401 | null = null;

  setOn401(fn: On401): void {
    this.on401 = fn;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<T> {
    const init: RequestInit = {
      method,
      credentials: 'include',
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const res = await fetch(path, init);
    if (res.status === 401) {
      this.on401?.();
      throw new BffApiError(401, 'unauthenticated', null);
    }
    if (!res.ok) {
      let parsed: unknown = null;
      try {
        parsed = await res.json();
      } catch {
        parsed = await res.text();
      }
      throw new BffApiError(res.status, `${method} ${path} failed (${res.status})`, parsed);
    }
    if (res.status === 204) return undefined as T;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('application/json')) return (await res.json()) as T;
    return (await res.text()) as unknown as T;
  }

  // ── auth ─────────────────────────────────────────────────────────────
  login(username: string, password: string): Promise<MeResponse> {
    return this.request<MeResponse>('POST', '/api/auth/login', { username, password });
  }

  logout(): Promise<{ status: 'ok' }> {
    return this.request<{ status: 'ok' }>('POST', '/api/auth/logout');
  }

  me(): Promise<MeResponse> {
    return this.request<MeResponse>('GET', '/api/auth/me');
  }

  // ── menu / layers ────────────────────────────────────────────────────
  menu(): Promise<MenuResponse> {
    return this.request<MenuResponse>('GET', '/api/menu');
  }

  oapInfo(): Promise<OapInfo> {
    return this.request<OapInfo>('GET', '/api/oap/info');
  }

  // ── overview dashboards (Services / Mesh / SO11Y ops) ────────────────
  overviewDashboards(): Promise<OverviewDashboardListResponse> {
    return this.request<OverviewDashboardListResponse>('GET', '/api/overview/dashboards');
  }

  overviewDashboard(id: string): Promise<OverviewDashboardResponse> {
    return this.request<OverviewDashboardResponse>(
      'GET',
      `/api/overview/dashboards/${encodeURIComponent(id)}`,
    );
  }

  // ── setup (per-layer overrides) ──────────────────────────────────────
  loadSetup(): Promise<SetupResponse> {
    return this.request<SetupResponse>('GET', '/api/setup');
  }

  saveSetup(payload: SetupSavePayload): Promise<SetupResponse> {
    return this.request<SetupResponse>('POST', '/api/setup', payload);
  }

  // ── landing (per-layer top-N) ────────────────────────────────────────
  layerLanding(
    layerKey: string,
    cfg: LandingConfig,
    range?: { step: 'MINUTE' | 'HOUR' | 'DAY'; startMs: number; endMs: number },
  ): Promise<LandingResponse> {
    // The wire payload mirrors LandingConfig minus the priority/style
    // bits the BFF doesn't care about.
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
    return this.request<LandingResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/landing`,
      body,
    );
  }

  // ── dashboards (per-layer widget data) ───────────────────────────────
  dashboardConfig(layerKey: string, scope?: string): Promise<DashboardConfig> {
    const qs = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    return this.request<DashboardConfig>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/dashboard/config${qs}`,
    );
  }
  dashboard(
    layerKey: string,
    body: {
      service?: string;
      /** Active instance name. When set with `scope === 'instance'`,
       *  the BFF flips each widget's MQE entity to ServiceInstance. */
      serviceInstance?: string;
      /** Active endpoint name. When set with `scope === 'endpoint'`,
       *  the BFF flips each widget's MQE entity to Endpoint. */
      endpoint?: string;
      widgets?: DashboardWidget[];
      scope?: string;
      /** OAP bucket size. Sent together with `startMs`/`endMs`. The
       *  BFF snaps the range to whole buckets and queries OAP with
       *  `Duration.step = step`. When omitted the BFF falls back to
       *  its legacy 60-minute MINUTE window. */
      step?: 'MINUTE' | 'HOUR' | 'DAY';
      /** Range start in ms since epoch. */
      startMs?: number;
      /** Range end in ms since epoch. */
      endMs?: number;
    } = {},
    /** Dev-mode mock: pad every TopList result to N entries with
     *  synthetic rows so operators can verify widget sizing without
     *  waiting for live data. Forwarded as `?mockTop=N`. */
    opts: { mockTop?: number } = {},
  ): Promise<DashboardResponse> {
    const qs = opts.mockTop && opts.mockTop > 0 ? `?mockTop=${opts.mockTop}` : '';
    return this.request<DashboardResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/dashboard${qs}`,
      body,
    );
  }
  /** Top-N endpoint search for a service. The per-layer Endpoint
   *  dashboard's picker calls this with the operator's search term;
   *  endpoints are unbounded by nature so we don't page through them.
   *  `limit` is clamped 20…50 by the BFF. */
  layerEndpoints(
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
    const qs = new URLSearchParams({
      service,
      q: query,
      limit: String(limit),
    });
    return this.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/endpoints?${qs.toString()}`,
    );
  }

  /** Service-map feed for the per-layer Topology tab. Returns the
   *  service neighbourhood centred on `service` (or the whole layer
   *  if omitted), each real node decorated with cpm / resp_time / sla.
   *  Depth controls BFS expansion (1…3); the operator can ratchet
   *  this up to inspect indirect callers. */
  layerTopology(layerKey: string, service?: string, depth = 1): Promise<TopologyResponse> {
    const qs = new URLSearchParams();
    if (service) qs.set('service', service);
    qs.set('depth', String(depth));
    return this.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/topology?${qs.toString()}`,
    );
  }

  /** API-dependency feed. Resolves `endpoint` (name or id) to an
   *  endpoint id via findEndpoint, then walks
   *  `getEndpointDependencies` to surface upstream callers and
   *  downstream callees with per-node MQE. */
  layerEndpointDependency(
    layerKey: string,
    service: string,
    endpoint: string,
  ): Promise<EndpointDependencyResponse> {
    const qs = new URLSearchParams({ service, endpoint });
    return this.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/endpoint-dependency?${qs.toString()}`,
    );
  }

  /** List traces — fans out to SW-native and / or Zipkin based on
   *  the layer's config and the operator's override. */
  layerTraces(
    layerKey: string,
    body: {
      source?: TraceSource;
      service?: string;
      serviceId?: string;
      instanceId?: string;
      endpointId?: string;
      traceId?: string;
      traceState?: TraceQueryState;
      queryOrder?: TraceQueryOrder;
      minTraceDuration?: number;
      maxTraceDuration?: number;
      pageNum?: number;
      pageSize?: number;
      tags?: Array<{ key: string; value: string }>;
      windowMinutes?: number;
      start?: string;
      end?: string;
    } = {},
  ): Promise<TraceListResponse> {
    return this.request<TraceListResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/traces`,
      body,
    );
  }

  /** Trace detail by id. `source=zipkin` swaps to the Zipkin REST
   *  path; default is native (v2/v3 picked automatically). */
  traceDetail(traceId: string, source: 'native' | 'zipkin' = 'native'): Promise<TraceDetailResponse> {
    const qs = new URLSearchParams({ source });
    return this.request<TraceDetailResponse>(
      'GET',
      `/api/trace/${encodeURIComponent(traceId)}?${qs.toString()}`,
    );
  }

  /** Log query — body shape mirrors OAP's `LogQueryCondition`. */
  layerLogs(layerKey: string, body: LogQueryRequest & { service?: string } = {}): Promise<LogsResponse> {
    return this.request<LogsResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/logs`,
      body,
    );
  }

  /** Tag autocomplete — list known tag keys for the duration window. */
  traceTagKeys(windowMinutes: number = 30): Promise<{ keys: string[]; generatedAt: number; error?: string }> {
    return this.request('GET', `/api/trace-tags/keys?windowMinutes=${windowMinutes}`);
  }
  /** Tag autocomplete — list values for a specific key. */
  traceTagValues(
    key: string,
    windowMinutes: number = 30,
  ): Promise<{ key: string; values: string[]; generatedAt: number; error?: string }> {
    return this.request(
      'GET',
      `/api/trace-tags/values?key=${encodeURIComponent(key)}&windowMinutes=${windowMinutes}`,
    );
  }

  /** Log facets — same body as `layerLogs`, but returns aggregated
   *  level + service counts across a larger window-scoped sample. */
  layerLogFacets(
    layerKey: string,
    body: LogQueryRequest & { service?: string; sampleSize?: number } = {},
  ): Promise<LogFacetsResponse> {
    return this.request<LogFacetsResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/logs/facets`,
      body,
    );
  }

  /** Log tag autocomplete — list known tag keys for a recent log
   *  window. Wraps OAP's `queryLogTagAutocompleteKeys`. */
  logTagKeys(
    windowMinutes: number = 30,
  ): Promise<{ keys: string[]; generatedAt: number; error?: string }> {
    return this.request('GET', `/api/log-tags/keys?windowMinutes=${windowMinutes}`);
  }
  /** Log tag autocomplete — list values for a specific key. Wraps
   *  OAP's `queryLogTagAutocompleteValues`. */
  logTagValues(
    key: string,
    windowMinutes: number = 30,
  ): Promise<{ key: string; values: string[]; generatedAt: number; error?: string }> {
    return this.request(
      'GET',
      `/api/log-tags/values?key=${encodeURIComponent(key)}&windowMinutes=${windowMinutes}`,
    );
  }

  // ── Zipkin trace endpoints (proxied to OAP's ZipkinQueryHandler) ──
  /** List services known to OAP's Zipkin store. */
  zipkinServices(): Promise<string[]> {
    return this.request('GET', '/api/zipkin/services');
  }
  /** List span names for a Zipkin service. */
  zipkinSpans(serviceName: string): Promise<string[]> {
    return this.request('GET', `/api/zipkin/spans?serviceName=${encodeURIComponent(serviceName)}`);
  }
  /** List remote (peer) services seen by a Zipkin service. */
  zipkinRemoteServices(serviceName: string): Promise<string[]> {
    return this.request('GET', `/api/zipkin/remote-services?serviceName=${encodeURIComponent(serviceName)}`);
  }
  /** Search Zipkin traces. Mirrors Zipkin v2 `/api/v2/traces`. */
  zipkinTraces(q: ZipkinTraceQuery = {}): Promise<ZipkinTraceListResponse> {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
      if (v === undefined || v === null || v === '') continue;
      params.set(k, String(v));
    }
    const qs = params.toString();
    return this.request<ZipkinTraceListResponse>('GET', `/api/zipkin/traces${qs ? '?' + qs : ''}`);
  }
  /** Fetch a single Zipkin trace by id. */
  zipkinTrace(traceId: string): Promise<ZipkinTraceDetailResponse> {
    return this.request<ZipkinTraceDetailResponse>('GET', `/api/zipkin/trace/${encodeURIComponent(traceId)}`);
  }
  /** Zipkin annotation autocomplete — keys configured on the OAP
   *  side (`/api/v2/autocompleteKeys`). */
  zipkinAutocompleteKeys(): Promise<string[]> {
    return this.request<string[]>('GET', '/api/zipkin/autocomplete/keys');
  }
  /** Zipkin annotation autocomplete — values for one key
   *  (`/api/v2/autocompleteValues?key=...`). */
  zipkinAutocompleteValues(key: string): Promise<string[]> {
    return this.request<string[]>(
      'GET',
      `/api/zipkin/autocomplete/values?key=${encodeURIComponent(key)}`,
    );
  }

  /** List active instances for a service. The per-layer Instance
   *  dashboard surfaces a second selector below the service picker;
   *  this feeds it. Accepts the service id or name. */
  layerInstances(
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
    return this.request(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/instances${qs}`,
    );
  }

  saveLayerTemplate(template: AdminLayerTemplate): Promise<{ template: AdminLayerTemplate }> {
    return this.request<{ template: AdminLayerTemplate }>(
      'POST',
      `/api/admin/layer-templates/${encodeURIComponent(template.key)}`,
      template,
    );
  }

  /** Admin: list every loaded layer template (alias / components / widgets). */
  adminLayerTemplates(): Promise<{ templates: AdminLayerTemplate[] }> {
    return this.request<{ templates: AdminLayerTemplate[] }>(
      'GET',
      '/api/admin/layer-templates',
    );
  }

  // ── trace (agent) profiling ──────────────────────────────────────────
  /** List profile tasks for a service (+ optional endpoint filter). */
  layerProfileTasks(
    layerKey: string,
    service: string,
    endpoint = '',
  ): Promise<ProfileTaskListResponse> {
    const qs = new URLSearchParams({ service });
    if (endpoint) qs.set('endpoint', endpoint);
    return this.request<ProfileTaskListResponse>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/profile/tasks?${qs.toString()}`,
    );
  }

  /** Create a profile task on the target service / endpoint. */
  createProfileTask(
    layerKey: string,
    body: ProfileTaskCreationRequest,
  ): Promise<ProfileTaskCreationResponse> {
    return this.request<ProfileTaskCreationResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/profile/tasks`,
      body,
    );
  }

  /** Sampled trace segments captured by a profile task. */
  profileTaskSegments(taskId: string): Promise<ProfileSegmentsResponse> {
    return this.request<ProfileSegmentsResponse>(
      'GET',
      `/api/profile/tasks/${encodeURIComponent(taskId)}/segments`,
    );
  }

  /** Per-instance operation log for a profile task (start / stop events). */
  profileTaskLogs(taskId: string): Promise<ProfileTaskLogsResponse> {
    return this.request<ProfileTaskLogsResponse>(
      'GET',
      `/api/profile/tasks/${encodeURIComponent(taskId)}/logs`,
    );
  }

  /** Resolve profile data for one or more span time-ranges into call trees. */
  profileAnalyze(queries: ProfileAnalyzeQuery[]): Promise<ProfileAnalyzationResponse> {
    return this.request<ProfileAnalyzationResponse>('POST', '/api/profile/analyze', { queries });
  }

  // ── eBPF profiling (ON_CPU / OFF_CPU, fixed-time) ───────────────────
  /** List eBPF profile tasks + the `couldProfiling` / process-label
   *  metadata used by the New Task form. */
  layerEBPFTasks(layerKey: string, service: string): Promise<EBPFTaskListResponse> {
    const qs = new URLSearchParams({ service });
    return this.request<EBPFTaskListResponse>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/ebpf/tasks?${qs.toString()}`,
    );
  }
  /** Create an eBPF fixed-time task. */
  createEBPFTask(
    layerKey: string,
    body: EBPFTaskCreationRequest,
  ): Promise<EBPFTaskCreationResponse> {
    return this.request<EBPFTaskCreationResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/ebpf/tasks`,
      body,
    );
  }
  /** Per-task schedules — one entry per (process, time-slice) captured
   *  by the task. */
  ebpfTaskSchedules(taskId: string): Promise<EBPFSchedulesResponse> {
    return this.request<EBPFSchedulesResponse>(
      'GET',
      `/api/ebpf/tasks/${encodeURIComponent(taskId)}/schedules`,
    );
  }
  /** Roll a set of schedules into stack-trees keyed by `aggregateType`
   *  (COUNT / DURATION). */
  ebpfAnalyze(body: EBPFAnalyzeRequest): Promise<EBPFAnalyzeResponse> {
    return this.request<EBPFAnalyzeResponse>('POST', '/api/ebpf/analyze', body);
  }

  // ── eBPF network profiling ───────────────────────────────────────────
  /** List NETWORK / CONTINUOUS_PROFILING eBPF tasks for a service or
   *  service-instance. */
  layerNetworkTasks(
    layerKey: string,
    args: { service?: string; serviceInstance?: string },
  ): Promise<EBPFTaskListResponse> {
    const qs = new URLSearchParams();
    if (args.service) qs.set('service', args.service);
    if (args.serviceInstance) qs.set('serviceInstance', args.serviceInstance);
    return this.request<EBPFTaskListResponse>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/ebpf/network/tasks?${qs.toString()}`,
    );
  }
  /** Process-level topology centred on a service-instance — the network
   *  profiling view's main visualization. */
  ebpfNetworkTopology(serviceInstance: string, windowMinutes = 30): Promise<ProcessTopologyResponse> {
    const qs = new URLSearchParams({ serviceInstance, windowMinutes: String(windowMinutes) });
    return this.request<ProcessTopologyResponse>('GET', `/api/ebpf/network/topology?${qs.toString()}`);
  }
  /** Create an eBPF network-profile task bound to an instance + sampling
   *  rules (4xx / 5xx / min-duration / URI regex). */
  createNetworkProfilingTask(body: NetworkProfilingCreateRequest): Promise<NetworkProfilingCreateResponse> {
    return this.request<NetworkProfilingCreateResponse>('POST', '/api/ebpf/network/tasks', body);
  }
  /** Heartbeat a continuous-profiling task so OAP keeps capturing. */
  keepAliveNetworkProfilingTask(taskId: string): Promise<NetworkProfilingKeepAliveResponse> {
    return this.request<NetworkProfilingKeepAliveResponse>(
      'POST',
      `/api/ebpf/network/tasks/${encodeURIComponent(taskId)}/keep-alive`,
    );
  }

  // ── Async profiler (Java) ─────────────────────────────────────────
  layerAsyncTasks(layerKey: string, service: string): Promise<AsyncProfilingTaskListResponse> {
    return this.request<AsyncProfilingTaskListResponse>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/async/tasks?service=${encodeURIComponent(service)}`,
    );
  }
  createAsyncProfilingTask(
    layerKey: string,
    body: AsyncProfilingTaskCreationRequest,
  ): Promise<AsyncProfilingTaskCreationResponse> {
    return this.request<AsyncProfilingTaskCreationResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/async/tasks`,
      body,
    );
  }
  asyncTaskProgress(taskId: string): Promise<AsyncProfilingProgressResponse> {
    return this.request<AsyncProfilingProgressResponse>(
      'GET',
      `/api/async/tasks/${encodeURIComponent(taskId)}/progress`,
    );
  }
  asyncAnalyze(body: {
    taskId: string;
    instanceIds: string[];
    eventType: string;
  }): Promise<AsyncProfilingAnalyzeResponse> {
    return this.request<AsyncProfilingAnalyzeResponse>('POST', '/api/async/analyze', body);
  }

  // ── pprof (Go) ────────────────────────────────────────────────────
  layerPprofTasks(layerKey: string, service: string): Promise<PprofTaskListResponse> {
    return this.request<PprofTaskListResponse>(
      'GET',
      `/api/layer/${encodeURIComponent(layerKey)}/pprof/tasks?service=${encodeURIComponent(service)}`,
    );
  }
  createPprofTask(
    layerKey: string,
    body: PprofTaskCreationRequest,
  ): Promise<PprofTaskCreationResponse> {
    return this.request<PprofTaskCreationResponse>(
      'POST',
      `/api/layer/${encodeURIComponent(layerKey)}/pprof/tasks`,
      body,
    );
  }
  pprofTaskProgress(taskId: string): Promise<PprofProgressResponse> {
    return this.request<PprofProgressResponse>(
      'GET',
      `/api/pprof/tasks/${encodeURIComponent(taskId)}/progress`,
    );
  }
  pprofAnalyze(body: {
    taskId: string;
    instanceIds: string[];
    eventType: string;
  }): Promise<PprofAnalyzeResponse> {
    return this.request<PprofAnalyzeResponse>('POST', '/api/pprof/analyze', body);
  }

  // ── cluster / preflight ──────────────────────────────────────────────
  /** Admin-port preflight — interrogates OAP's `/debugging/config/dump`
   *  and reports which SWIP-13 selectors are on. Drives the admin
   *  section of /operate/cluster and the per-page warning headers on
   *  admin-host routes. */
  preflight(): Promise<PreflightResult> {
    return this.request<PreflightResult>('GET', '/api/preflight');
  }

  clusterState(): Promise<ClusterStateResponse> {
    return this.request<ClusterStateResponse>('GET', '/api/cluster/state');
  }

  // ── DSL Management (runtime-rule) ────────────────────────────────────

  /** `GET /api/catalog/list[?catalog=]` — proxied envelope from OAP's
   *  `/runtime/rule/list`. Each row carries enough fields for badges
   *  (`bundled`, `bundledContentHash`, `contentHash`) so no second
   *  call is needed for the catalog browse. */
  catalogList(catalog?: Catalog): Promise<ListEnvelope> {
    const path = catalog
      ? `/api/catalog/list?catalog=${encodeURIComponent(catalog)}`
      : '/api/catalog/list';
    return this.request<ListEnvelope>('GET', path);
  }

  /** `GET /api/rule?catalog=&name=[&source=]` — fetches YAML body
   *  + metadata headers, normalised into a {@link RuleResponse}.
   *  Returns `null` on 404 (rule doesn't exist anywhere). */
  async getRule(args: {
    catalog: Catalog;
    name: string;
    source?: RuleSource;
  }): Promise<RuleResponse | null> {
    const params = new URLSearchParams({ catalog: args.catalog, name: args.name });
    if (args.source) params.set('source', args.source);
    const path = `/api/rule?${params.toString()}`;
    const res = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/x-yaml' },
    });
    if (res.status === 401) {
      this.on401?.();
      throw new BffApiError(401, 'unauthenticated', null);
    }
    if (res.status === 404) return null;
    if (!res.ok) {
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { parsed = await res.text(); }
      throw new BffApiError(res.status, `GET ${path} failed (${res.status})`, parsed);
    }
    const content = await res.text();
    return {
      status: (res.headers.get('x-sw-status') as RuleResponse['status']) ?? 'n/a',
      source: (res.headers.get('x-sw-source') as RuleResponse['source']) ?? 'runtime',
      contentHash: res.headers.get('x-sw-content-hash') ?? '',
      updateTime: Number(res.headers.get('x-sw-update-time') ?? '0'),
      etag: res.headers.get('etag') ?? '',
      content,
    };
  }

  /** `POST /api/rule?catalog=&name=[&allowStorageChange=][&force=]`.
   *  The body is the raw YAML text. */
  async saveRule(args: {
    catalog: Catalog;
    name: string;
    body: string;
    allowStorageChange?: boolean;
    force?: boolean;
  }): Promise<ApplyResult> {
    const params = new URLSearchParams({ catalog: args.catalog, name: args.name });
    if (args.allowStorageChange) params.set('allowStorageChange', 'true');
    if (args.force) params.set('force', 'true');
    const path = `/api/rule?${params.toString()}`;
    const res = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'text/plain' },
      body: args.body,
    });
    if (res.status === 401) {
      this.on401?.();
      throw new BffApiError(401, 'unauthenticated', null);
    }
    if (!res.ok) {
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { parsed = await res.text(); }
      throw new BffApiError(res.status, `POST ${path} failed (${res.status})`, parsed);
    }
    return (await res.json()) as ApplyResult;
  }

  /** `POST /api/rule/inactivate?catalog=&name=` */
  inactivateRule(catalog: Catalog, name: string): Promise<ApplyResult> {
    const params = new URLSearchParams({ catalog, name });
    return this.request<ApplyResult>('POST', `/api/rule/inactivate?${params.toString()}`);
  }

  /** `POST /api/rule/delete?catalog=&name=[&mode=revertToBundled]` */
  deleteRule(catalog: Catalog, name: string, mode: DeleteMode = ''): Promise<ApplyResult> {
    const params = new URLSearchParams({ catalog, name });
    if (mode) params.set('mode', mode);
    return this.request<ApplyResult>('POST', `/api/rule/delete?${params.toString()}`);
  }

  /** `GET /api/catalog/bundled?catalog=` */
  catalogBundled(catalog: Catalog, withContent = true): Promise<BundledEntry[]> {
    const params = new URLSearchParams({ catalog, withContent: String(withContent) });
    return this.request<BundledEntry[]>('GET', `/api/catalog/bundled?${params.toString()}`);
  }

  // ── OAL (read-only) ──────────────────────────────────────────────────

  oalFiles(): Promise<OalFilesResponse> {
    return this.request<OalFilesResponse>('GET', '/api/oal/files');
  }

  /** Returns the raw `.oal` text or `null` on 404. */
  async oalFileContent(name: string): Promise<string | null> {
    const res = await fetch(`/api/oal/files/${encodeURIComponent(name)}`, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'text/plain' },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      let parsed: unknown = null;
      try { parsed = await res.json(); } catch { parsed = await res.text(); }
      throw new BffApiError(res.status, `oal/files/${name} failed`, parsed);
    }
    return res.text();
  }

  oalSources(): Promise<OalRulesResponse> {
    return this.request<OalRulesResponse>('GET', '/api/oal/rules');
  }

  async oalSource(source: string): Promise<OalSourceDetail | null> {
    try {
      return await this.request<OalSourceDetail>(
        'GET',
        `/api/oal/rules/${encodeURIComponent(source)}`,
      );
    } catch (err) {
      if (err instanceof BffApiError && err.status === 404) return null;
      throw err;
    }
  }

  // ── Live debugger (SWIP-13 `/dsl-debugging/*`) ───────────────────────

  debugStart(args: StartSessionArgs): Promise<StartSessionResponse> {
    return this.request<StartSessionResponse>('POST', '/api/debug/session', args);
  }

  async debugSession(id: string): Promise<SessionResponse | null> {
    try {
      return await this.request<SessionResponse>(
        'GET',
        `/api/debug/session/${encodeURIComponent(id)}`,
      );
    } catch (err) {
      if (err instanceof BffApiError && err.status === 404) return null;
      throw err;
    }
  }

  debugStop(id: string): Promise<StopSessionResponse> {
    return this.request<StopSessionResponse>(
      'POST',
      `/api/debug/session/${encodeURIComponent(id)}/stop`,
    );
  }

  debugSessions(): Promise<ActiveSessionsResponse> {
    return this.request<ActiveSessionsResponse>('GET', '/api/debug/sessions');
  }

  debugStatus(): Promise<ClusterDebugStatus> {
    return this.request<ClusterDebugStatus>('GET', '/api/debug/status');
  }

  // ── Inspect (SWIP-14) ────────────────────────────────────────────────

  inspectCatalog(refresh = false): Promise<InspectCatalogResponse> {
    const path = refresh ? '/api/inspect/catalog?refresh=true' : '/api/inspect/catalog';
    return this.request<InspectCatalogResponse>('GET', path);
  }

  inspectEntities(args: {
    metric: string;
    start: string;
    end: string;
    step: InspectStep;
    limit?: number;
  }): Promise<EntitiesResponse> {
    const params = new URLSearchParams({
      metric: args.metric,
      start: args.start,
      end: args.end,
      step: args.step,
    });
    if (args.limit !== undefined) params.set('limit', String(args.limit));
    return this.request<EntitiesResponse>('GET', `/api/inspect/entities?${params.toString()}`);
  }

  inspectMqeTarget(refresh = false): Promise<InspectMqeTargetResponse> {
    const path = refresh ? '/api/inspect/mqe-target?refresh=true' : '/api/inspect/mqe-target';
    return this.request<InspectMqeTargetResponse>('GET', path);
  }

  inspectExec(req: InspectExecRequest): Promise<ExpressionResult> {
    return this.request<ExpressionResult>('POST', '/api/inspect/exec', req);
  }

  inspectServerTime(refresh = false): Promise<InspectServerTimeResponse> {
    const path = refresh ? '/api/inspect/server-time?refresh=true' : '/api/inspect/server-time';
    return this.request<InspectServerTimeResponse>('GET', path);
  }

  /** Trigger an `/api/dump[/{catalog}]` download. Uses an invisible
   *  anchor click — the BFF session cookie is HttpOnly and gets sent
   *  with the same-origin request automatically. */
  triggerDump(catalog?: Catalog): void {
    const path = catalog
      ? `/api/dump/${encodeURIComponent(catalog)}`
      : '/api/dump';
    const a = document.createElement('a');
    a.href = path;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  // ── Alarms ───────────────────────────────────────────────────────────

  alarms(q: AlarmsQuery): Promise<AlarmsResponse> {
    const p = new URLSearchParams({
      startTime: String(q.startTime),
      endTime: String(q.endTime),
      pageNum: String(q.pageNum ?? 1),
      pageSize: String(q.pageSize ?? 100),
    });
    if (q.scope) p.set('scope', q.scope);
    if (q.keyword) p.set('keyword', q.keyword);
    if (q.service) p.set('service', q.service);
    if (q.instance) p.set('instance', q.instance);
    if (q.endpoint) p.set('endpoint', q.endpoint);
    return this.request<AlarmsResponse>('GET', `/api/alarms?${p.toString()}`);
  }

  alarmsTraffic(startTime: number, endTime: number): Promise<AlarmTrafficResponse> {
    const p = new URLSearchParams({
      startTime: String(startTime),
      endTime: String(endTime),
    });
    return this.request<AlarmTrafficResponse>('GET', `/api/alarms/traffic?${p.toString()}`);
  }

  /** Service roster for a single OAP layer — feeds the alarms-page
   *  filter cascade. Returned alpha-sorted by the BFF. */
  alarmsServices(layer: string): Promise<{
    layer: string;
    services: Array<{ name: string; normal: boolean | null }>;
  }> {
    const p = new URLSearchParams({ layer });
    return this.request('GET', `/api/alarms/services?${p.toString()}`);
  }

  alarmsConfig(): Promise<AlarmsConfig> {
    return this.request<AlarmsConfig>('GET', '/api/alarms/config');
  }

  saveAlarmsConfig(next: AlarmsConfig): Promise<AlarmsConfig> {
    return this.request<AlarmsConfig>('POST', '/api/alarms/config', next);
  }
}

// ── Alarms wire types (BFF-only) ──────────────────────────────────────
// Kept inline (not in @skywalking-horizon-ui/api-client) because every
// shape here is BFF-shaped — getAlarm's raw output gets layer-tagged
// per row, traffic is BFF-aggregated across services, and the config
// is a BFF JSON file. None of these belong on the OAP wire side of
// the boundary.

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

export interface AlarmMqeKeyValue {
  key: string;
  value: string;
}
export interface AlarmMqeValueRow {
  id?: string | null;
  value: string | null;
  traceID?: string | null;
}
export interface AlarmMqeValuesGroup {
  metric?: { labels?: AlarmMqeKeyValue[] } | null;
  values: AlarmMqeValueRow[];
}
export interface AlarmMqeMetric {
  name: string;
  results: AlarmMqeValuesGroup[];
}
export interface AlarmSnapshot {
  expression: string;
  metrics: AlarmMqeMetric[];
}
export interface AlarmMessage {
  id: string;
  startTime: number;
  recoveryTime: number | null;
  scope: AlarmScope;
  name: string;
  message: string;
  tags: AlarmMqeKeyValue[];
  /** Optional — the BFF list query omits `events` because some OAP
   *  storage backends throw `fail to query stream` when streaming
   *  events alongside an alarm page. Available on dedicated per-
   *  alarm fetches if those land later. */
  events?: Array<Record<string, unknown>>;
  snapshot: AlarmSnapshot;
  /** BFF-attached layer tag derived from the service roster. Null when
   *  the entity name isn't a known service. */
  layerKey: string | null;
}
export interface AlarmsResponse {
  total: number;
  pageNum: number;
  pageSize: number;
  generatedAt: number;
  msgs: AlarmMessage[];
}
export interface AlarmsQuery {
  startTime: number;
  endTime: number;
  scope?: string;
  keyword?: string;
  pageNum?: number;
  pageSize?: number;
  service?: string;
  instance?: string;
  endpoint?: string;
}
export interface AlarmTrafficPoint {
  ts: number;
  value: number | null;
}
export interface AlarmTrafficSeries {
  layerKey: string;
  label: string;
  present: boolean;
  points: AlarmTrafficPoint[];
  error?: string;
}
export interface AlarmTrafficResponse {
  generatedAt: number;
  startTime: number;
  endTime: number;
  step: 'MINUTE';
  series: AlarmTrafficSeries[];
}
export interface AlarmTrafficLayerConfig {
  layerKey: string;
  mqe: string;
  label?: string;
}
export interface AlarmsConfig {
  trafficLayers: AlarmTrafficLayerConfig[];
}

export const bffClient = new BffClient();

/** Vantage-compatible alias — imported as `bff` by ported views. */
export const bff = bffClient;
