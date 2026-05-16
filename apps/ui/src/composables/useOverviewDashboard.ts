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

import { computed, type Ref } from 'vue';
import { useQueries, useQuery } from '@tanstack/vue-query';
import type { LandingConfig, OverviewDashboard, OverviewWidget } from '@skywalking-horizon-ui/api-client';
import { bffClient } from '@/api/client';

/**
 * Resolved value for one overview widget. The renderer reads
 * `values[widget.id]` (or for `kpi-tile`, `kpiValues[widget.id][label]`).
 *
 * Values come from the existing per-layer `landing` route, which already
 * computes layer-wide sum/avg aggregates. We batch one landing call per
 * referenced layer with all that layer's widget MQEs folded into a
 * single `columns` request — N layers => N round-trips, not N*M.
 */
export interface OverviewWidgetValues {
  /** Aggregate value for `metric` / `service-count` widgets. */
  values: Record<string, number | null>;
  /** Per-KPI values for `kpi-tile` widgets, keyed by widget id then label. */
  kpiValues: Record<string, Record<string, number | null>>;
}

interface MqeRequest {
  widgetId: string;
  kpiLabel?: string;
  mqe: string;
  aggregation: 'sum' | 'avg';
  unit?: string;
}

/**
 * Group every data-bound widget by its `layer`. Section-breaks, alarms,
 * and topology widgets are skipped (no aggregate to evaluate).
 */
function groupByLayer(widgets: OverviewWidget[]): Map<string, MqeRequest[]> {
  const out = new Map<string, MqeRequest[]>();
  for (const w of widgets) {
    const layer = w.layer;
    if (!layer) continue;
    if (w.type === 'section-break' || w.type === 'alarms' || w.type === 'topology') continue;
    if (w.type === 'service-count') {
      // Service count lives in the landing aggregates as `serviceCount`,
      // no MQE column needed — but we still tag the layer so the call
      // happens.
      if (!out.has(layer)) out.set(layer, []);
      continue;
    }
    if (w.type === 'metric' && w.mqe) {
      const reqs = out.get(layer) ?? [];
      reqs.push({
        widgetId: w.id,
        mqe: w.mqe,
        aggregation: w.aggregation ?? 'avg',
        unit: w.unit,
      });
      out.set(layer, reqs);
      continue;
    }
    if (w.type === 'kpi-tile' && w.kpis) {
      const reqs = out.get(layer) ?? [];
      for (const k of w.kpis) {
        reqs.push({
          widgetId: w.id,
          kpiLabel: k.label,
          mqe: k.mqe,
          aggregation: k.aggregation ?? 'avg',
          unit: k.unit,
        });
      }
      out.set(layer, reqs);
      continue;
    }
    if (w.type === 'k8s-summary') {
      const reqs = out.get(layer) ?? [];
      for (const k of K8S_SUMMARY_KPIS) {
        reqs.push({
          widgetId: w.id,
          kpiLabel: k.label,
          mqe: k.mqe,
          aggregation: k.aggregation,
          unit: k.unit,
        });
      }
      out.set(layer, reqs);
      continue;
    }
    if (w.type === 'pilot-summary') {
      const reqs = out.get(layer) ?? [];
      for (const k of PILOT_SUMMARY_KPIS) {
        reqs.push({
          widgetId: w.id,
          kpiLabel: k.label,
          mqe: k.mqe,
          aggregation: k.aggregation,
          unit: k.unit,
        });
      }
      out.set(layer, reqs);
    }
  }
  return out;
}

/** Fixed-shape KPI set for the K8s capacity / utilisation block. The
 *  widget renderer reads these labels back to lay them out.
 *
 *  Count metrics are gauges — wrap with `latest()` so the per-bucket
 *  evaluation returns the most recent observed value rather than a
 *  series average. Usage % is derived per booster-ui's k8s-cluster
 *  template: requests-to-total for CPU + memory, and (total − allocatable)
 *  / total for storage (no requests meter exists for storage). */
export const K8S_SUMMARY_KPIS: ReadonlyArray<{
  label: string;
  mqe: string;
  unit?: string;
  aggregation: 'sum' | 'avg';
}> = [
  { label: 'Nodes', mqe: 'latest(k8s_cluster_node_total)', aggregation: 'avg' },
  { label: 'Namespaces', mqe: 'latest(k8s_cluster_namespace_total)', aggregation: 'avg' },
  { label: 'Deployments', mqe: 'latest(k8s_cluster_deployment_total)', aggregation: 'avg' },
  { label: 'StatefulSets', mqe: 'latest(k8s_cluster_statefulset_total)', aggregation: 'avg' },
  { label: 'DaemonSets', mqe: 'latest(k8s_cluster_daemonset_total)', aggregation: 'avg' },
  { label: 'Services', mqe: 'latest(k8s_cluster_service_total)', aggregation: 'avg' },
  { label: 'Containers', mqe: 'latest(k8s_cluster_container_total)', aggregation: 'avg' },
  {
    label: 'CPU',
    mqe: 'k8s_cluster_cpu_cores_requests/k8s_cluster_cpu_cores*100',
    unit: '%',
    aggregation: 'avg',
  },
  {
    label: 'Memory',
    mqe: 'k8s_cluster_memory_requests/k8s_cluster_memory_total*100',
    unit: '%',
    aggregation: 'avg',
  },
  {
    label: 'Storage',
    mqe:
      '(k8s_cluster_storage_total-k8s_cluster_storage_allocatable)/k8s_cluster_storage_total*100',
    unit: '%',
    aggregation: 'avg',
  },
];

/** Fixed-shape KPI set for the Istio pilot block. Compact 4-up layout
 *  to match the neighbour service tile's visual weight. Every metric
 *  is pulled verbatim from booster-ui's `mesh-control-plane-service.json`
 *  (entity = Service, layer = MESH_CP).
 *
 *  "Pilot errors" mirrors booster-ui's widget title of the same name —
 *  there's no single error counter in OAP, so we sum the four xDS
 *  reject types plus the write-timeout meter via MQE arithmetic to
 *  surface one number. Individual reject types remain visible on the
 *  per-layer Control Plane page's Pilot Errors chart. */
export const PILOT_SUMMARY_KPIS: ReadonlyArray<{
  label: string;
  mqe: string;
  unit?: string;
  aggregation: 'sum' | 'avg';
}> = [
  { label: 'xDS pushes', mqe: 'meter_istio_pilot_xds_pushes', aggregation: 'sum' },
  { label: 'xDS connections', mqe: 'meter_istio_pilot_xds', aggregation: 'avg' },
  { label: 'Services', mqe: 'meter_istio_pilot_services', aggregation: 'avg' },
  {
    label: 'Pilot errors',
    mqe:
      'meter_istio_pilot_xds_cds_reject+meter_istio_pilot_xds_eds_reject+' +
      'meter_istio_pilot_xds_lds_reject+meter_istio_pilot_xds_rds_reject+' +
      'meter_istio_pilot_xds_write_timeout',
    aggregation: 'sum',
  },
];

/**
 * Load one overview dashboard + its widget values. Topology widgets are
 * resolved by the consumer (TopologySnapshotWidget hits the per-layer
 * topology route directly) — this composable only fans out the MQE
 * aggregate calls.
 */
export function useOverviewDashboard(idRef: Ref<string>) {
  const dash = useQuery({
    queryKey: ['overview-dashboard', idRef],
    queryFn: () => bffClient.overview.get(idRef.value),
    enabled: computed(() => Boolean(idRef.value)),
    staleTime: 60_000,
  });

  const widgets = computed<OverviewWidget[]>(() => dash.data.value?.dashboard.widgets ?? []);
  const layerRequests = computed(() => groupByLayer(widgets.value));

  // One landing call per referenced layer. Bundling all that layer's
  // MQEs in one request keeps the round-trip count to N, where N is the
  // distinct layer count in the dashboard — usually 1–3.
  const layerQueries = useQueries({
    queries: computed(() => {
      const entries = Array.from(layerRequests.value.entries());
      return entries.map(([layer, reqs]) => ({
        queryKey: ['overview-dashboard-data', idRef.value, layer],
        queryFn: () => {
          // priority + style are required by the LandingConfig type
          // but ignored by the BFF route — the client only forwards
          // topN/orderBy/columns. Stubbed to satisfy the type.
          const cfg: LandingConfig = {
            priority: 0,
            style: 'table',
            topN: 1,
            orderBy: reqs[0]?.mqe ?? 'service_cpm',
            columns: reqs.map((r, i) => ({
              metric: `w_${i}`,
              label: r.kpiLabel ?? r.widgetId,
              mqe: r.mqe,
              aggregation: r.aggregation,
              unit: r.unit,
            })),
          };
          return bffClient.layer.landing(layer, cfg).then((res) => ({
            layer,
            reqs,
            aggregates: res.aggregates,
          }));
        },
        staleTime: 30_000,
        refetchOnWindowFocus: true,
      }));
    }),
  });

  const values = computed<OverviewWidgetValues>(() => {
    const out: OverviewWidgetValues = { values: {}, kpiValues: {} };
    // First pass: service-count widgets pull from the landing aggregate's
    // `serviceCount` field on the matching layer.
    for (const w of widgets.value) {
      if (w.type === 'service-count' && w.layer) {
        const r = layerQueries.value.find((q) => q.data?.layer === w.layer);
        out.values[w.id] = r?.data?.aggregates.serviceCount ?? null;
      }
    }
    // Second pass: metric / kpi-tile / k8s-summary / pilot-summary read
    // their MQE values out of the layer aggregate keyed by `w_<idx>`.
    for (const q of layerQueries.value) {
      const data = q.data;
      if (!data) continue;
      const { reqs, aggregates } = data;
      reqs.forEach((r, i) => {
        const v = aggregates.metrics[`w_${i}`] ?? null;
        if (r.kpiLabel) {
          if (!out.kpiValues[r.widgetId]) out.kpiValues[r.widgetId] = {};
          out.kpiValues[r.widgetId][r.kpiLabel] = v;
        } else {
          out.values[r.widgetId] = v;
        }
      });
      // service-count widgets sharing the layer pick up the count from
      // the same landing call. kpi-tile widgets with showCount=true do
      // the same — the count slot above the KPI rows reads
      // `values[widget.id]`, same as a standalone service-count tile.
      for (const w of widgets.value) {
        if (w.layer !== data.layer) continue;
        if (w.type === 'service-count' || (w.type === 'kpi-tile' && w.showCount)) {
          out.values[w.id] = aggregates.serviceCount;
        }
      }
    }
    return out;
  });

  const dashboard = computed<OverviewDashboard | null>(() => dash.data.value?.dashboard ?? null);
  const isLoadingData = computed(() => layerQueries.value.some((q) => q.isLoading));

  return {
    isLoading: dash.isLoading,
    isLoadingData,
    isError: dash.isError,
    dashboard,
    widgets,
    values,
  };
}
