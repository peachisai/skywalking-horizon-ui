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
  Istio pilot block. xDS push count, reject errors, write timeouts, and
  p95 push time — sourced from the MESH_CP layer via the standard
  landing aggregate. Click-through opens the MESH_CP layer's Instance
  tab (where per-pilot drill-down lives).
-->
<script setup lang="ts">
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { PILOT_SUMMARY_KPIS } from '@/composables/useOverviewDashboard';
import { formatValue } from './ValueFormat';

const props = defineProps<{
  title: string;
  tip?: string;
  layer?: string;
  kpiValues: Record<string, number | null>;
}>();

const tileTo = computed(() =>
  props.layer ? `/layer/${props.layer.toLowerCase()}/instance` : '',
);
</script>

<template>
  <component :is="tileTo ? RouterLink : 'div'" :to="tileTo || undefined" class="tile-link">
    <section class="sw-card pilot">
      <header>
        <h4>{{ title }}</h4>
        <span v-if="tip" class="tip" :title="tip">?</span>
      </header>
      <div class="kpis">
        <div v-for="k in PILOT_SUMMARY_KPIS" :key="k.label" class="kpi">
          <span class="kpi-value">{{ formatValue(kpiValues[k.label], k.unit) }}</span>
          <span class="kpi-label">{{ k.label }}</span>
        </div>
      </div>
    </section>
  </component>
</template>

<style scoped>
.tile-link { display: block; text-decoration: none; color: inherit; height: 100%; }
.tile-link:hover .sw-card { border-color: var(--sw-line-3); }
.pilot { display: flex; flex-direction: column; padding: 12px 14px; gap: 12px; min-height: 0; height: 100%; }
header { display: flex; align-items: center; gap: 6px; }
h4 { margin: 0; font-size: 12px; font-weight: 600; color: var(--sw-fg-0); }
.tip {
  font-size: 9px; color: var(--sw-fg-3); border: 1px solid var(--sw-line-2);
  border-radius: 50%; width: 13px; height: 13px;
  display: inline-flex; align-items: center; justify-content: center; cursor: help;
}
.kpis {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; flex: 1;
}
.kpi {
  display: flex; flex-direction: column; gap: 4px;
  padding: 10px 12px;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 6px;
  justify-content: center;
}
.kpi-value {
  font-size: 20px; font-weight: 600; color: var(--sw-fg-0);
  font-variant-numeric: tabular-nums;
}
.kpi-label {
  font-size: 10.5px; color: var(--sw-fg-3); text-transform: uppercase; letter-spacing: 0.05em;
}
</style>
