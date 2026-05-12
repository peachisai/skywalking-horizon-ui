<!--
  Licensed to the Apache Software Foundation (ASF) under one or more
  contributor license agreements.  See the NOTICE file distributed with
  this work for additional information regarding copyright ownership.
  The ASF licenses this file to You under the Apache License, Version 2.0
  (the "License"); you may not use this file except in compliance with
  the License.  You may obtain a copy of the License at

      http://www.apache.org/licenses/LICENSE-2.0

  Unless required by applicable law or agreed to in writing, software
  distributed under the License is distributed on an "AS IS" BASIS,
  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  See the License for the specific language governing permissions and
  limitations under the License.
-->
<!--
  Per-layer Dashboards tab. Widget set + MQE expressions are seeded from
  the BFF (lifted from booster-ui's templates); widget data comes from a
  single POST /api/layer/:key/dashboard call scoped to the currently
  selected service.

  Cards (single-value KPIs) render with a big number + unit; line
  widgets render with a TimeChart wrapping ECharts. Grid layout uses
  24-column CSS grid coordinates matching booster-ui's vue-grid-layout
  so position + span port straight from the upstream templates.
-->
<script setup lang="ts">
import { computed } from 'vue';
import { useRoute, RouterLink } from 'vue-router';
import TimeChart from '@/components/charts/TimeChart.vue';
import {
  useLayerDashboard,
  useLayerDashboardConfig,
} from '@/composables/useLayerDashboard';
import { useSelectedService } from '@/composables/useSelectedService';
import { fmtMetric } from '@/utils/formatters';

const route = useRoute();
const layerKey = computed(() => String(route.params.layerKey ?? ''));
const { selectedId } = useSelectedService();
const { config, isLoading: configLoading } = useLayerDashboardConfig(layerKey);
const { data, isFetching, error } = useLayerDashboard(layerKey, selectedId);

const widgets = computed(() => config.value?.widgets ?? []);
const resultsById = computed(() => {
  const out = new Map<string, NonNullable<typeof data.value>['widgets'][number]>();
  for (const r of data.value?.widgets ?? []) out.set(r.id, r);
  return out;
});
const serviceText = computed(() => data.value?.service ?? selectedId.value ?? '(auto)');
const reachable = computed(() => data.value?.reachable !== false);
const errorText = computed(() => data.value?.error ?? (error.value ? String(error.value) : null));
</script>

<template>
  <div class="dash-tab">
    <header class="dash-head">
      <div>
        <div class="kicker">Service</div>
        <h2>{{ widgets.length }} widget{{ widgets.length === 1 ? '' : 's' }}</h2>
        <p class="sub">
          MQE scoped to <code>{{ serviceText }}</code>.
          Refreshes every 60s. <RouterLink to="/admin/layer-dashboards">Customize widgets</RouterLink>.
        </p>
      </div>
      <div class="state">
        <span v-if="isFetching" class="badge fetch">refreshing</span>
        <span v-else-if="!reachable" class="badge err">OAP unreachable</span>
        <span v-else class="badge ok">live</span>
      </div>
    </header>

    <div v-if="!reachable" class="banner err">
      <strong>OAP unreachable.</strong>
      {{ errorText ?? 'Widgets are showing nothing — check the BFF is up and OAP is reachable.' }}
    </div>

    <div v-if="configLoading" class="empty">Loading dashboard config…</div>
    <div v-else-if="widgets.length === 0" class="empty">
      No widgets defined for this layer. Phase 7 admin will let operators add their own.
    </div>
    <div v-else class="grid">
      <div
        v-for="w in widgets"
        :key="w.id"
        class="widget sw-card"
        :style="{
          gridColumn: `span ${w.w}`,
          gridRow: `span ${w.h}`,
        }"
      >
        <div class="w-head" :title="w.tip">
          <h4>{{ w.title }}</h4>
          <span v-if="w.unit" class="unit">{{ w.unit }}</span>
        </div>
        <div class="w-body">
          <template v-if="resultsById.get(w.id)?.error">
            <span class="muted">{{ resultsById.get(w.id)!.error }}</span>
          </template>
          <template v-else-if="w.type === 'card'">
            <div class="card-value">
              <span class="num" :class="{ muted: resultsById.get(w.id)?.value == null }">
                {{ fmtMetric(resultsById.get(w.id)?.value ?? null) }}
              </span>
              <span v-if="w.unit" class="unit">{{ w.unit }}</span>
            </div>
          </template>
          <template v-else-if="w.type === 'line'">
            <TimeChart
              v-if="resultsById.get(w.id)?.series?.length"
              :series="resultsById.get(w.id)!.series!"
              :unit="w.unit"
              :height="Math.max(120, w.h * 14)"
            />
            <span v-else class="muted">no data</span>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dash-tab {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 4px 0 0;
}
.dash-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sw-accent);
}
.dash-head h2 {
  margin: 2px 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: var(--sw-fg-0);
  letter-spacing: -0.01em;
}
.dash-head .sub {
  margin: 0;
  font-size: 11px;
  color: var(--sw-fg-2);
  line-height: 1.5;
}
.dash-head .sub code {
  font-family: var(--sw-mono);
  font-size: 10.5px;
  background: var(--sw-bg-2);
  padding: 1px 4px;
  border-radius: 3px;
}
.dash-head .sub a {
  color: var(--sw-accent-2);
  text-decoration: none;
}
.state {
  margin-left: auto;
}
.badge {
  font-size: 10px;
  padding: 3px 8px;
  border-radius: 999px;
  font-weight: 500;
}
.badge.ok {
  color: var(--sw-ok);
  background: rgba(34, 197, 94, 0.1);
}
.badge.fetch {
  color: var(--sw-info);
  background: rgba(96, 165, 250, 0.1);
}
.badge.err {
  color: var(--sw-err);
  background: rgba(239, 68, 68, 0.1);
}
.banner.err {
  padding: 8px 12px;
  background: var(--sw-err-soft);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 11.5px;
}
.empty {
  padding: 32px;
  text-align: center;
  color: var(--sw-fg-3);
  font-size: 12px;
}
.grid {
  display: grid;
  grid-template-columns: repeat(24, 1fr);
  grid-auto-rows: 14px;
  gap: 10px;
}
.widget {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}
.w-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--sw-line);
}
.w-head h4 {
  margin: 0;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--sw-fg-0);
  letter-spacing: -0.01em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.w-head .unit {
  font-size: 10px;
  color: var(--sw-fg-3);
  flex: 0 0 auto;
}
.w-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px 12px;
  min-height: 0;
}
.card-value {
  display: flex;
  align-items: baseline;
  gap: 4px;
}
.card-value .num {
  font-size: 26px;
  font-weight: 700;
  color: var(--sw-fg-0);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.card-value .num.muted {
  color: var(--sw-fg-3);
}
.card-value .unit {
  font-size: 11px;
  color: var(--sw-fg-3);
}
.muted {
  color: var(--sw-fg-3);
  font-size: 11px;
}
.w-body :deep(.time-chart) {
  width: 100%;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: repeat(12, 1fr);
  }
  .widget {
    grid-column: span 12 !important;
  }
}
</style>
