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
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import type { OverviewKpi } from '@skywalking-horizon-ui/api-client';
import { formatValue } from './ValueFormat';

const props = defineProps<{
  title: string;
  tip?: string;
  /** Layer key — clicking the tile navigates to the layer's Service page. */
  layer?: string;
  showCount?: boolean;
  count: number | null | undefined;
  kpis: OverviewKpi[];
  /** Value per kpi.label. */
  kpiValues: Record<string, number | null>;
}>();

// BFF /api/menu lowercases layer keys, and that's the casing the sidebar
// and per-layer routes all use. The overview JSON authors uppercase
// (matching OAP's enum), so normalise here so the click-through URL
// matches the rest of the app.
const tileTo = computed(() =>
  props.layer ? `/layer/${props.layer.toLowerCase()}/service` : '',
);
</script>

<template>
  <RouterLink v-if="tileTo" :to="tileTo" class="tile-link">
    <section class="sw-card tile">
      <header>
        <h4>{{ title }}</h4>
        <span v-if="tip" class="tip" :title="tip">?</span>
      </header>
      <div v-if="showCount" class="count">
        <span class="count-label">Services</span>
        <span class="count-value">{{ formatValue(count) }}</span>
      </div>
      <div class="kpis">
        <div v-for="k in kpis" :key="k.label" class="kpi">
          <span class="kpi-label">{{ k.label }}</span>
          <span class="kpi-value">{{ formatValue(kpiValues[k.label], k.unit) }}</span>
        </div>
      </div>
    </section>
  </RouterLink>
  <div v-else class="tile-link">
    <section class="sw-card tile">
      <header>
        <h4>{{ title }}</h4>
        <span v-if="tip" class="tip" :title="tip">?</span>
      </header>
      <div v-if="showCount" class="count">
        <span class="count-label">Services</span>
        <span class="count-value">{{ formatValue(count) }}</span>
      </div>
      <div class="kpis">
        <div v-for="k in kpis" :key="k.label" class="kpi">
          <span class="kpi-label">{{ k.label }}</span>
          <span class="kpi-value">{{ formatValue(kpiValues[k.label], k.unit) }}</span>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.tile-link { display: block; text-decoration: none; color: inherit; height: 100%; }
.tile-link:hover .sw-card { border-color: var(--sw-line-3); }
.tile { display: flex; flex-direction: column; padding: 10px 12px; gap: 8px; min-height: 0; height: 100%; }
header { display: flex; align-items: center; gap: 6px; }
h4 { margin: 0; font-size: 11px; font-weight: 600; color: var(--sw-fg-1); }
.tip {
  font-size: 9px; color: var(--sw-fg-3); border: 1px solid var(--sw-line-2);
  border-radius: 50%; width: 13px; height: 13px;
  display: inline-flex; align-items: center; justify-content: center; cursor: help;
}
.count {
  display: flex; align-items: baseline; gap: 8px;
  padding: 2px 0 6px;
  border-bottom: 1px dashed var(--sw-line);
}
.count-label { font-size: 10px; color: var(--sw-fg-3); text-transform: uppercase; letter-spacing: 0.08em; }
.count-value {
  font-size: 22px; font-weight: 600; color: var(--sw-fg-0);
  font-variant-numeric: tabular-nums; margin-left: auto;
}
.kpis { display: flex; flex-direction: column; gap: 4px; }
.kpi { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
.kpi-label { font-size: 11px; color: var(--sw-fg-2); }
.kpi-value {
  font-size: 13px; font-weight: 600; color: var(--sw-fg-0);
  font-variant-numeric: tabular-nums;
}
</style>
