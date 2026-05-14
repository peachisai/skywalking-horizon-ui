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
  Per-layer Logs tab — Loki / Datadog visualization style.
   - Condition bar with the scoping chips + free-text keyword search.
   - Time-bucketed density histogram (60 bins) across the top, stacked
     by level (error / warn / info / debug / unknown).
   - Faceted sidebar with level + service breakdowns (counts derived
     from the loaded page).
   - Dense stream: one row per log; click expands inline showing the
     full payload (auto-detected as JSON or text) + tags + trace link.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { LayerDef, LogRow, LogTagFilter } from '@/api/client';
import { useLayerLanding } from '@/composables/useLayerLanding';
import { useLayerLogs, useLayerLogFacets } from '@/composables/useLayerLogs';
import { useLayers } from '@/composables/useLayers';
import { useSelectedService } from '@/composables/useSelectedService';
import { useSetupStore } from '@/stores/setup';

const route = useRoute();
const router = useRouter();
const layerKey = computed(() => String(route.params.layerKey ?? ''));

const { selectedId, setSelected: setSelectedService } = useSelectedService();
const { layers } = useLayers();
const layer = computed<LayerDef | null>(() => layers.value.find((l) => l.key === layerKey.value) ?? null);
const store = useSetupStore();
const safeLayer = computed<LayerDef>(() => layer.value ?? {
  key: layerKey.value, name: layerKey.value, color: 'var(--sw-fg-2)',
  serviceCount: -1, active: false, level: null, slots: {}, caps: {},
});
const safeCfg = computed(() => {
  if (!layer.value) return { priority: 99, topN: 5, orderBy: 'cpm', columns: [], style: 'table' as const };
  return store.ensure(layer.value.key, {
    slots: layer.value.slots, caps: layer.value.caps, metrics: layer.value.metrics, overview: layer.value.overview,
  }).landing;
});
const landing = useLayerLanding(safeLayer, safeCfg);
const serviceName = computed<string | null>(() => {
  const rows = landing.data.value?.sampledRows ?? landing.rows.value ?? [];
  const match = rows.find((r) => r.serviceId === selectedId.value);
  return match?.serviceName ?? null;
});
const landingRows = computed(() => landing.data.value?.sampledRows ?? landing.rows.value ?? []);
watch(
  landingRows,
  (rows) => {
    if (selectedId.value) return;
    const first = rows[0];
    if (first) setSelectedService(first.serviceId);
  },
  { immediate: true },
);

// ── Query state ────────────────────────────────────────────────────
const traceIdParam = computed(() => {
  const v = route.query.traceId;
  return typeof v === 'string' && v.length > 0 ? v : null;
});
const keywordInput = ref('');
const committedKeywords = ref<string[]>([]);
const customTags = ref<LogTagFilter[]>([]);
const page = ref(1);
const pageSize = ref(50);
const traceIdRef = computed(() => traceIdParam.value);
const instanceIdRef = ref<string | null>(null);
const endpointIdRef = ref<string | null>(null);
const keywordsRef = computed(() => committedKeywords.value);

function submitSearch(): void {
  const v = keywordInput.value.trim();
  committedKeywords.value = v ? v.split(/\s+/) : [];
  page.value = 1;
}
function clearSearch(): void {
  keywordInput.value = '';
  committedKeywords.value = [];
  page.value = 1;
}

// ── Level filter goes to OAP as a `level=<UPPER>` tag filter so the
// server-side total + pagination match the visible rows. The filter
// is single-select (booster-ui uses the same pattern).
const LEVEL_TAG_VALUES: Record<'error' | 'warn' | 'info' | 'debug', string> = {
  error: 'ERROR',
  warn: 'WARN',
  info: 'INFO',
  debug: 'DEBUG',
};
const selectedLevel = ref<'error' | 'warn' | 'info' | 'debug' | null>(null);
const allTags = computed<LogTagFilter[]>(() => {
  const out = [...customTags.value];
  if (selectedLevel.value) {
    out.push({ key: 'level', value: LEVEL_TAG_VALUES[selectedLevel.value] });
  }
  return out;
});
function toggleLevel(l: 'error' | 'warn' | 'info' | 'debug' | 'other'): void {
  if (l === 'other') return; // server-side has no canonical value for "other"
  selectedLevel.value = selectedLevel.value === l ? null : l;
  page.value = 1;
}

const { logs, total, isFetching, error, refetch } = useLayerLogs(layerKey, {
  service: serviceName,
  instanceId: instanceIdRef,
  endpointId: endpointIdRef,
  traceId: traceIdRef,
  keywords: keywordsRef,
  tags: allTags,
  page,
  pageSize,
});

const { facets } = useLayerLogFacets(layerKey, {
  service: serviceName,
  instanceId: instanceIdRef,
  endpointId: endpointIdRef,
  traceId: traceIdRef,
  keywords: keywordsRef,
});

// ── Density histogram (60 bins). Loki/Datadog style: stacked bars
// per level over the visible page's time window. Counts come from
// the loaded page only — total-window density would need a server
// aggregation we don't have yet. -----------------------------------

const LEVEL_ORDER = ['error', 'warn', 'info', 'debug', 'other'] as const;
type Level = typeof LEVEL_ORDER[number];
const LEVEL_COLOR: Record<Level, string> = {
  error: 'var(--sw-err)',
  warn: 'var(--sw-warn)',
  info: 'var(--sw-info)',
  debug: 'var(--sw-fg-3)',
  other: 'var(--sw-fg-3)',
};

function levelOf(r: LogRow): Level {
  const tag = (r.tags ?? []).find((t) => t.key.toLowerCase() === 'level');
  const raw = (tag?.value ?? '').toLowerCase();
  if (raw.includes('error') || raw === 'err' || raw === 'fatal') return 'error';
  if (raw.includes('warn')) return 'warn';
  if (raw.includes('info')) return 'info';
  if (raw.includes('debug') || raw.includes('trace')) return 'debug';
  return 'other';
}

const BINS = 60;
const histogram = computed(() => {
  const rows = logs.value;
  if (rows.length === 0) return { bins: [] as Array<Record<Level, number>>, max: 0, t0: 0, t1: 0 };
  let t0 = Infinity;
  let t1 = -Infinity;
  for (const r of rows) {
    if (r.timestamp < t0) t0 = r.timestamp;
    if (r.timestamp > t1) t1 = r.timestamp;
  }
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t0 === t1) {
    t0 = (t1 || Date.now()) - 60_000;
    t1 = t1 || Date.now();
  }
  const span = t1 - t0 || 1;
  const bins: Array<Record<Level, number>> = Array.from({ length: BINS }, () => ({
    error: 0,
    warn: 0,
    info: 0,
    debug: 0,
    other: 0,
  }));
  for (const r of rows) {
    const idx = Math.min(BINS - 1, Math.floor(((r.timestamp - t0) / span) * BINS));
    bins[idx][levelOf(r)] += 1;
  }
  let max = 0;
  for (const b of bins) {
    const t = b.error + b.warn + b.info + b.debug + b.other;
    if (t > max) max = t;
  }
  return { bins, max, t0, t1 };
});

// ── Facets — server-side aggregated across a larger window sample
// (default 200 rows). When the facet fetch hasn't returned yet we
// fall back to counts derived from the visible page so the rail
// never goes empty.
const levelFacet = computed<Record<Level, number>>(() => {
  if (facets.value?.level) return facets.value.level;
  const counts: Record<Level, number> = { error: 0, warn: 0, info: 0, debug: 0, other: 0 };
  for (const r of logs.value) counts[levelOf(r)] += 1;
  return counts;
});
// Service facet removed — the log query is already service-scoped
// (the view is opened from /layer/<key>/logs with a specific service
// selected), so a "top services" rail just repeats the title.

// Since the level filter now goes to OAP, the visible logs already
// reflect it — no client-side narrowing needed.
const filteredLogs = computed<LogRow[]>(() => logs.value);

// ── Row expand state. Loki / Datadog use inline expand for the
// detail rather than a separate right pane. ----------------------
const expandedId = ref<string | null>(null);
function rowKey(r: LogRow, idx: number): string {
  return `${r.timestamp}-${r.traceId ?? ''}-${idx}`;
}
function toggleExpand(key: string): void {
  expandedId.value = expandedId.value === key ? null : key;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}
function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}
function summariseContent(r: LogRow): string {
  if (!r.content) return '';
  const oneLine = r.content.replace(/\s+/g, ' ').trim();
  return oneLine.length > 220 ? oneLine.slice(0, 218) + '…' : oneLine;
}
function tryPrettyJson(content: string): string {
  try {
    return JSON.stringify(JSON.parse(content), null, 2);
  } catch {
    return content;
  }
}

function jumpToTrace(traceId: string): void {
  void router.push({
    path: `/layer/${layerKey.value}/trace`,
    query: { traceId },
  });
}
</script>

<template>
  <div class="lg-tab">
    <!-- Condition bar -->
    <header class="lg-toolbar sw-card">
      <span class="kicker">Logs</span>
      <span v-if="serviceName" class="for-svc">on <b>{{ serviceName }}</b></span>
      <span v-if="traceIdParam" class="trace-pin">trace <code>{{ traceIdParam.slice(0, 12) }}…</code></span>
      <span v-if="isFetching" class="hint">refreshing…</span>
      <div class="filters">
        <input
          v-model="keywordInput"
          class="kw-search"
          type="search"
          placeholder="Search content (space-separated keywords, press Enter)…"
          @keydown.enter.prevent="submitSearch"
          @search="submitSearch"
        />
        <button class="sw-btn small" type="button" @click="submitSearch">Search</button>
        <button v-if="committedKeywords.length > 0" class="sw-btn small ghost" type="button" @click="clearSearch">
          Clear
        </button>
        <label class="f-field">
          <span>Page size</span>
          <select v-model.number="pageSize">
            <option :value="20">20</option>
            <option :value="50">50</option>
            <option :value="100">100</option>
          </select>
        </label>
        <button class="sw-btn small" type="button" @click="() => refetch()">Refresh</button>
      </div>
    </header>

    <div v-if="error" class="banner err">
      <strong>Logs feed failed.</strong> {{ String(error) }}
    </div>

    <!-- Histogram + main stream -->
    <section class="lg-body sw-card">
      <div class="lg-main">
        <!-- Top-of-table legend strip — one chip per level with the
             in-window count when data exists. Clickable: toggles the
             level filter. The service axis is intentionally absent
             (this query is already service-scoped, so the service
             dimension carries no information). -->
        <div v-if="facets || logs.length > 0" class="lg-legend">
          <span class="lg-legend-kicker">Levels</span>
          <button
            v-for="l in LEVEL_ORDER"
            :key="l"
            type="button"
            class="lg-legend-chip"
            :class="{ on: selectedLevel === l, disabled: l === 'other' }"
            :disabled="l === 'other'"
            @click="toggleLevel(l)"
          >
            <span class="lvl-dot" :style="{ background: LEVEL_COLOR[l] }" />
            <span class="lg-legend-name">{{ l }}</span>
            <span v-if="levelFacet[l] > 0" class="lg-legend-count">{{ levelFacet[l] }}</span>
          </button>
          <span v-if="facets" class="lg-legend-sample" :title="`window sample of ${facets.sampled} rows`">
            sample of {{ facets.sampled }}
          </span>
        </div>

        <!-- Density bar -->
        <div class="lg-density" v-if="histogram.bins.length > 0">
          <div
            v-for="(bin, i) in histogram.bins"
            :key="i"
            class="lg-density-bin"
            :title="histogram.t0 ? new Date(histogram.t0 + ((histogram.t1 - histogram.t0) * (i + 0.5)) / 60).toLocaleString() : ''"
          >
            <span
              v-for="l in LEVEL_ORDER"
              :key="l"
              class="lg-density-segment"
              :style="{
                background: LEVEL_COLOR[l],
                height: histogram.max ? (bin[l] / histogram.max * 100) + '%' : '0%',
              }"
            />
          </div>
        </div>

        <!-- Stream -->
        <div v-if="filteredLogs.length === 0" class="lg-empty">
          {{ logs.length === 0 ? 'No logs returned for this scope.' : 'No logs match the active level filter.' }}
        </div>
        <div v-else class="lg-stream">
          <template v-for="(r, idx) in filteredLogs" :key="rowKey(r, idx)">
            <div class="lg-row" :class="`lv-${levelOf(r)}`" @click="toggleExpand(rowKey(r, idx))">
              <span class="lg-time mono">{{ fmtTime(r.timestamp) }}</span>
              <span class="lg-date mono dim">{{ fmtDate(r.timestamp) }}</span>
              <span class="lg-lvl" :style="{ color: LEVEL_COLOR[levelOf(r)] }">{{ levelOf(r) }}</span>
              <span class="lg-svc mono dim">{{ r.serviceName ?? '—' }}</span>
              <span v-if="r.traceId" class="lg-trace mono" @click.stop="jumpToTrace(r.traceId!)">↗ trace</span>
              <span class="lg-content mono">{{ summariseContent(r) }}</span>
            </div>
            <div v-if="expandedId === rowKey(r, idx)" class="lg-expand">
              <pre
                v-if="r.contentType === 'application/json'"
                class="lg-payload json"
              >{{ tryPrettyJson(r.content) }}</pre>
              <pre v-else class="lg-payload text">{{ r.content }}</pre>
              <div v-if="r.tags.length > 0" class="lg-tag-row">
                <span v-for="t in r.tags" :key="`${t.key}=${t.value}`" class="lg-tag">
                  <span class="lg-tag-k">{{ t.key }}</span>
                  <span class="lg-tag-v mono">{{ t.value }}</span>
                </span>
              </div>
              <div class="lg-meta-row">
                <span v-if="r.serviceInstanceName" class="lg-meta">instance <code>{{ r.serviceInstanceName }}</code></span>
                <span v-if="r.endpointName" class="lg-meta">endpoint <code>{{ r.endpointName }}</code></span>
                <span class="lg-meta">type <code>{{ r.contentType }}</code></span>
              </div>
            </div>
          </template>
        </div>
        <div class="lg-pager">
          <span class="hint">page {{ page }} · showing {{ filteredLogs.length }} of {{ total }} total</span>
          <div class="lg-pager-ctrls">
            <button class="sw-btn small" type="button" :disabled="page <= 1" @click="page--">Prev</button>
            <button
              class="sw-btn small"
              type="button"
              :disabled="logs.length < pageSize"
              @click="page++"
            >Next</button>
          </div>
        </div>
      </div>
    </section>
  </div>
</template>

<style scoped>
.lg-tab { display: flex; flex-direction: column; gap: 12px; padding: 4px 0 0; }
.lg-toolbar {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 12px;
  flex-wrap: wrap;
}
.kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sw-accent);
  font-weight: 600;
}
.for-svc { font-size: 11.5px; color: var(--sw-fg-3); }
.for-svc b { color: var(--sw-fg-1); font-family: var(--sw-mono); font-weight: 500; }
.trace-pin {
  font-size: 10.5px;
  color: var(--sw-accent-2);
  background: var(--sw-accent-soft);
  border: 1px solid var(--sw-accent-line);
  padding: 1px 6px;
  border-radius: 4px;
}
.trace-pin code { font-family: var(--sw-mono); }
.hint { font-size: 10.5px; color: var(--sw-fg-3); }
.filters {
  display: inline-flex;
  align-items: baseline;
  gap: 8px;
  margin-left: auto;
  flex-wrap: wrap;
  flex: 1;
  min-width: 320px;
}
.kw-search {
  flex: 1;
  min-width: 220px;
  height: 26px;
  padding: 0 8px;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line-2);
  border-radius: 4px;
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 11.5px;
}
.kw-search:focus { outline: none; border-color: var(--sw-accent-line); }
.f-field {
  display: inline-flex;
  align-items: baseline;
  gap: 5px;
  font-size: 10.5px;
  color: var(--sw-fg-3);
}
.f-field select {
  height: 26px;
  padding: 0 6px;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line-2);
  border-radius: 4px;
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 11px;
}
.banner.err {
  padding: 8px 12px;
  background: var(--sw-err-soft);
  border: 1px solid rgba(239, 68, 68, 0.3);
  border-radius: 6px;
  color: #f87171;
  font-size: 11.5px;
}

.lg-body {
  padding: 0;
  min-height: 540px;
}
/* Top-of-table level legend — chips sit above the density bar so the
   level counts surface at the same scan line the user reads the
   timeline. Clicking a chip filters the stream to that level. */
.lg-legend {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sw-line);
  flex-wrap: wrap;
}
.lg-legend-kicker {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sw-fg-3);
  margin-right: 6px;
}
.lg-legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line-2);
  border-radius: 12px;
  color: var(--sw-fg-1);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
}
.lg-legend-chip:hover { color: var(--sw-fg-0); border-color: var(--sw-line); }
.lg-legend-chip.on {
  color: var(--sw-accent-2);
  background: var(--sw-accent-soft);
  border-color: var(--sw-accent-line);
}
.lg-legend-chip.disabled { opacity: 0.45; cursor: not-allowed; }
.lg-legend-name { text-transform: capitalize; }
.lg-legend-count {
  font-family: var(--sw-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--sw-fg-2);
  padding: 0 4px;
  border-left: 1px solid var(--sw-line-2);
  margin-left: 2px;
}
.lg-legend-chip.on .lg-legend-count { color: var(--sw-accent-2); border-color: var(--sw-accent-line); }
.lg-legend-sample {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--sw-fg-3);
  font-family: var(--sw-mono);
}
.lvl-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex: 0 0 auto;
}

.lg-main {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.lg-density {
  display: grid;
  grid-template-columns: repeat(60, 1fr);
  align-items: end;
  gap: 1px;
  height: 60px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--sw-line);
  background: var(--sw-bg-1);
}
.lg-density-bin {
  display: flex;
  flex-direction: column-reverse;
  height: 100%;
  background: var(--sw-bg-2);
  border-radius: 1px;
  overflow: hidden;
}
.lg-density-segment { display: block; }
.lg-empty {
  padding: 32px;
  text-align: center;
  color: var(--sw-fg-3);
  font-size: 11.5px;
}
.lg-stream {
  flex: 1;
  overflow-y: auto;
  font-size: 11.5px;
}
.lg-row {
  display: grid;
  grid-template-columns: 80px 60px 56px 140px 60px 1fr;
  gap: 10px;
  align-items: center;
  padding: 4px 12px;
  border-bottom: 1px solid var(--sw-line);
  cursor: pointer;
}
.lg-row:hover { background: var(--sw-bg-2); }
.lg-row.lv-error { box-shadow: inset 3px 0 0 var(--sw-err); }
.lg-row.lv-warn { box-shadow: inset 3px 0 0 var(--sw-warn); }
.lg-time { font-family: var(--sw-mono); color: var(--sw-fg-1); }
.lg-date { font-size: 10px; }
.lg-lvl {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
}
.lg-svc { font-size: 10.5px; }
.lg-trace {
  font-size: 10px;
  color: var(--sw-accent-2);
  cursor: pointer;
  padding: 1px 5px;
  background: var(--sw-accent-soft);
  border: 1px solid var(--sw-accent-line);
  border-radius: 3px;
}
.lg-trace:hover { color: var(--sw-fg-0); }
.lg-content {
  font-family: var(--sw-mono);
  font-size: 11px;
  color: var(--sw-fg-1);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lg-expand {
  padding: 10px 14px 14px 28px;
  border-bottom: 1px solid var(--sw-line);
  background: var(--sw-bg-2);
}
.lg-payload {
  margin: 0 0 8px;
  padding: 8px 10px;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 4px;
  font-family: var(--sw-mono);
  font-size: 11px;
  color: var(--sw-fg-1);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 280px;
  overflow: auto;
}
.lg-payload.json { color: var(--sw-cyan); }
.lg-tag-row {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 6px;
}
.lg-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  font-size: 10.5px;
  padding: 1px 6px;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 3px;
}
.lg-tag-k { color: var(--sw-fg-3); }
.lg-tag-v { color: var(--sw-fg-1); }
.lg-meta-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 10.5px;
  color: var(--sw-fg-3);
}
.lg-meta code {
  font-family: var(--sw-mono);
  color: var(--sw-fg-2);
  background: var(--sw-bg-1);
  padding: 1px 4px;
  border-radius: 3px;
}

.lg-pager {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 14px;
  border-top: 1px solid var(--sw-line);
}
.lg-pager .hint { font-size: 10.5px; color: var(--sw-fg-3); }
.lg-pager-ctrls { margin-left: auto; display: inline-flex; gap: 6px; }
.dim { color: var(--sw-fg-3); }
.mono { font-family: var(--sw-mono); }
.sw-btn.small {
  height: 24px;
  padding: 0 10px;
  font-size: 11px;
}
.sw-btn.ghost {
  background: transparent;
}

@media (max-width: 1100px) {
  .lg-legend { padding: 8px 10px; gap: 4px; }
  .lg-legend-chip { padding: 2px 7px; font-size: 11px; }
}
</style>
