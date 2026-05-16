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
  Right-side detail pane for a single alarm. Shows:
   - rule message + status pill
   - trigger expression (MQE) from snapshot.expression
   - snapshot.metrics rendered as a small TimeChart so operators see
     the actual values that crossed threshold at the firing moment
   - entity scope (service / instance / endpoint)
   - tags

  Alarms are read-only on the OAP side (auto-recover) — no acknowledge
  / silence buttons here, by design.
-->
<script setup lang="ts">
import { computed } from 'vue';
import type { AlarmMessage } from '@/api/client';
import TimeChart from '@/components/charts/TimeChart.vue';

const props = defineProps<{ alarm: AlarmMessage | null }>();

const firing = computed<boolean>(() => props.alarm?.recoveryTime === null);

const startedRelative = computed<string>(() => {
  if (!props.alarm) return '';
  return formatRelative(props.alarm.startTime);
});
const recoveredRelative = computed<string>(() => {
  if (!props.alarm?.recoveryTime) return '';
  return formatRelative(props.alarm.recoveryTime);
});

function formatRelative(ts: number): string {
  const delta = Date.now() - ts;
  if (delta < 0) return new Date(ts).toLocaleString();
  const s = Math.floor(delta / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m ago`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h ago`;
}

interface ChartSpec {
  title: string;
  labels: string[];
  series: Array<{ label: string; data: Array<number | null> }>;
}

const charts = computed<ChartSpec[]>(() => {
  if (!props.alarm) return [];
  const out: ChartSpec[] = [];
  for (const metric of props.alarm.snapshot.metrics) {
    if (metric.results.length === 0) continue;
    const maxLen = Math.max(...metric.results.map((r) => r.values.length), 0);
    const series = metric.results.map((r, i) => {
      const labels = (r.metric?.labels ?? []).map((l) => `${l.key}=${l.value}`).join(',');
      return {
        label: labels.length > 0 ? labels : `series ${i + 1}`,
        data: r.values.map((v) => {
          if (v.value === null) return null;
          const n = Number(v.value);
          return Number.isFinite(n) ? n : null;
        }),
      };
    });
    // Bucket indices on the x-axis — OAP doesn't return per-bucket
    // timestamps with the snapshot; using indices keeps it stable.
    const labels: string[] = [];
    for (let i = 0; i < maxLen; i++) labels.push(String(i));
    out.push({ title: metric.name, labels, series });
  }
  return out;
});
</script>

<template>
  <aside class="ad" v-if="alarm">
    <header class="ad__head">
      <h2 class="ad__id">{{ alarm.id }}</h2>
      <span class="sw-badge" :class="firing ? 'is-err' : 'is-ok'">
        <span class="state-dot" />{{ firing ? 'firing' : 'recovered' }}
      </span>
    </header>

    <p class="ad__rule">{{ alarm.message }}</p>
    <div class="ad__sub">
      <span>started {{ startedRelative }}</span>
      <template v-if="!firing"> · recovered {{ recoveredRelative }}</template>
    </div>

    <section class="ad__sec">
      <div class="ad__kicker">Trigger expression</div>
      <pre class="ad__expr">{{ alarm.snapshot.expression || '— no MQE recorded —' }}</pre>
    </section>

    <section class="ad__sec">
      <div class="ad__kicker">Scope</div>
      <div class="ad__scope">
        <span class="ad__tag">{{ alarm.scope ?? 'unknown' }}</span>
        <code class="ad__entity">{{ alarm.name }}</code>
        <span v-if="alarm.layerKey" class="ad__tag">{{ alarm.layerKey }}</span>
      </div>
    </section>

    <section v-if="alarm.tags.length > 0" class="ad__sec">
      <div class="ad__kicker">Tags</div>
      <div class="ad__tags">
        <span v-for="t in alarm.tags" :key="`${t.key}=${t.value}`" class="ad__tag">
          {{ t.key }}={{ t.value }}
        </span>
      </div>
    </section>

    <section v-for="c in charts" :key="c.title" class="ad__sec">
      <div class="ad__kicker">{{ c.title }}</div>
      <TimeChart :series="c.series" :height="100" format="decimal" />
    </section>

    <section v-if="charts.length === 0" class="ad__sec ad__empty">
      No MQE snapshot was recorded with this alarm. Upgrade OAP or
      enable the snapshot capture in the alarm rule to see the trigger
      values here.
    </section>
  </aside>

  <aside v-else class="ad ad--empty">
    <div class="ad__placeholder">
      <div class="ad__placeholder-kicker">No alarm selected</div>
      <p>Click a marker on the timeline or a row in the list to see its trigger details.</p>
    </div>
  </aside>
</template>

<style scoped>
.ad {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  max-height: calc(100vh - 140px);
}
.ad--empty {
  align-items: center;
  justify-content: center;
}
.ad__placeholder {
  text-align: center;
  color: var(--sw-fg-3);
  font-size: 12px;
}
.ad__placeholder-kicker {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-2);
  margin-bottom: 6px;
}
.ad__placeholder p {
  max-width: 240px;
  margin: 0;
  line-height: 1.5;
}
.ad__head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ad__id {
  font-family: var(--sw-mono);
  font-size: 12px;
  color: var(--sw-fg-2);
  margin: 0;
  flex: 1;
}
.ad__rule {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-fg-0);
  margin: 0;
  line-height: 1.4;
}
.ad__sub {
  font-size: 11px;
  color: var(--sw-fg-3);
}
.ad__sec {
  border-top: 1px solid var(--sw-line);
  padding-top: 12px;
}
.ad__kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-3);
  margin-bottom: 6px;
}
.ad__expr {
  font-family: var(--sw-mono);
  font-size: 11.5px;
  color: var(--sw-fg-0);
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line);
  border-radius: 5px;
  padding: 8px 10px;
  margin: 0;
  white-space: pre-wrap;
  word-break: break-all;
  line-height: 1.5;
}
.ad__scope {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}
.ad__entity {
  font-family: var(--sw-mono);
  font-size: 11.5px;
  color: var(--sw-fg-0);
  background: var(--sw-bg-2);
  padding: 2px 6px;
  border-radius: 3px;
}
.ad__tag {
  font-size: 10.5px;
  color: var(--sw-fg-1);
  background: var(--sw-bg-2);
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid var(--sw-line);
}
.ad__tags {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.ad__empty {
  color: var(--sw-fg-3);
  font-size: 11.5px;
  line-height: 1.5;
}
.sw-badge .state-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  margin-right: 4px;
  display: inline-block;
  vertical-align: middle;
}
.sw-badge.is-ok {
  color: var(--sw-ok);
  background: var(--sw-ok-soft);
  border-color: rgba(34, 197, 94, 0.3);
}
.sw-badge.is-err {
  color: var(--sw-err);
  background: var(--sw-err-soft);
  border-color: rgba(239, 68, 68, 0.3);
}
</style>
