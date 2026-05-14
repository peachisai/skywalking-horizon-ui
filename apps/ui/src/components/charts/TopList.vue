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
  Compact sorted-list renderer for `top_n(...)` MQE results. Each row
  has a name + value + a horizontal bar normalized to the row's value
  vs the list max.

  Supports two shapes:
   - `items` — single sorted list (one MQE, one view)
   - `groups` — multiple sorted lists, one per MQE expression. Renders
     a tab switcher at the top so operators can toggle between e.g.
     "Top by traffic" / "Top slowest" / "Top by SR" without leaving the
     widget. The first group is active by default.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { DashboardTopItem } from '@skywalking-horizon-ui/api-client';
import { fmtMetric } from '@/utils/formatters';

interface TopGroup {
  label: string;
  /** MQE that produced this list — surfaced in the tab tooltip so the
   *  operator can copy/reuse the expression. */
  expression?: string;
  /** Per-tab unit override. Falls back to the widget-level `unit` prop
   *  when missing. Lets one widget mix rpm / ms / % across tabs. */
  unit?: string;
  items: DashboardTopItem[];
}

const props = withDefaults(
  defineProps<{
    items?: ReadonlyArray<DashboardTopItem>;
    groups?: ReadonlyArray<TopGroup>;
    unit?: string;
    color?: string;
  }>(),
  {
    color: 'var(--sw-accent)',
  },
);

// Normalize: derive the effective groups (always render via the tab
// path, single-list case becomes a 1-group set with no tabs visible).
const effectiveGroups = computed<TopGroup[]>(() => {
  if (props.groups && props.groups.length > 0) return [...props.groups];
  if (props.items) return [{ label: '', items: [...props.items] }];
  return [];
});
const activeIdx = ref(0);
watch(effectiveGroups, (g) => {
  // Reset to first tab when the group set changes shape.
  if (activeIdx.value >= g.length) activeIdx.value = 0;
});
const activeGroup = computed(() => effectiveGroups.value[activeIdx.value] ?? null);
const activeItems = computed<DashboardTopItem[]>(() => activeGroup.value?.items ?? []);
const activeUnit = computed<string | undefined>(() => activeGroup.value?.unit ?? props.unit);

const max = computed(() => {
  let m = 0;
  for (const it of activeItems.value) {
    const v = it.value;
    if (v !== null && Number.isFinite(v) && v > m) m = v;
  }
  return m || 1;
});
function pct(v: number | null): number {
  if (v === null || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(100, (v / max.value) * 100));
}
const showTabs = computed(() => effectiveGroups.value.length > 1);
</script>

<template>
  <div class="top-list">
    <div v-if="showTabs" class="tabs">
      <button
        v-for="(g, i) in effectiveGroups"
        :key="i"
        type="button"
        class="tab"
        :class="{ on: activeIdx === i }"
        :title="g.expression ? `${g.label}\n\n${g.expression}` : g.label"
        @click="activeIdx = i"
      >
        {{ g.label }}
      </button>
    </div>
    <div class="rows">
      <div v-for="(it, i) in activeItems" :key="i" class="row" :title="it.name">
        <span class="rank">{{ i + 1 }}</span>
        <span class="name">{{ it.name }}</span>
        <div class="bar"><div class="fill" :style="{ width: `${pct(it.value)}%`, background: color }" /></div>
        <span class="value">
          {{ fmtMetric(it.value) }}<span v-if="activeUnit" class="unit">{{ activeUnit }}</span>
        </span>
      </div>
      <p v-if="activeItems.length === 0" class="empty">No data</p>
    </div>
  </div>
</template>

<style scoped>
.top-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
}
.tabs {
  display: flex;
  gap: 2px;
  padding: 2px 0 6px;
  border-bottom: 1px solid var(--sw-line);
  margin-bottom: 4px;
}
.tab {
  padding: 4px 10px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sw-fg-2);
  background: transparent;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  font: inherit;
  text-transform: capitalize;
  white-space: nowrap;
}
.tab:hover {
  background: var(--sw-bg-2);
  color: var(--sw-fg-1);
}
.tab.on {
  background: var(--sw-bg-3);
  color: var(--sw-fg-0);
  font-weight: 600;
}
.rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px 2px 4px;
  overflow-y: auto;
  flex: 1;
  min-height: 0;
}
.row {
  display: grid;
  grid-template-columns: 22px 1fr 56px 72px;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  padding: 0;
  line-height: 1.35;
}
.rank {
  font-family: var(--sw-mono);
  font-size: 12px;
  color: var(--sw-fg-3);
  text-align: right;
}
.name {
  font-family: var(--sw-mono);
  font-size: 14px;
  color: var(--sw-fg-1);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar {
  height: 6px;
  background: var(--sw-bg-3);
  border-radius: 2px;
  overflow: hidden;
}
.fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.2s ease-out;
}
.value {
  font-family: var(--sw-mono);
  font-size: 13.5px;
  color: var(--sw-fg-1);
  text-align: right;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.value .unit {
  margin-left: 2px;
  color: var(--sw-fg-3);
  font-size: 12px;
  font-weight: 500;
}
.empty {
  font-size: 14px;
  color: var(--sw-fg-3);
  text-align: center;
  margin: 14px 0;
}
</style>
