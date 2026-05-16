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
  Alarms page. Independent — not bound to a layer template, not an
  overview dashboard. Layout:

   ┌── header ─────────────────────────────────────────────────┐
   │ Alarms                              [1h] [6h] [24h]       │
   │ filters: service / instance / endpoint                    │
   ├── KPI strip ──────────────────────────────────────────────┤
   │ Firing · Window total · Layers · Selection                │
   ├── timeline (background traffic + alarm flags) ───────────┤
   │ click flag = select alarm                                 │
   │ drag region = select time range                           │
   ├── grouped list ─────────────┬── alarm detail ─────────────┤
   │ by layer (one section each) │ expression + trigger metrics│
   └─────────────────────────────┴─────────────────────────────┘
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  bff,
  bffClient,
  type AlarmMessage,
  type AlarmsResponse,
  type AlarmTrafficPoint,
  type AlarmTrafficSeries,
} from '@/api/client';
import { useLayers } from '@/composables/useLayers';
import AlarmsTimeline from '@/components/charts/AlarmsTimeline.vue';
import AlarmDetailPanel from './AlarmDetailPanel.vue';

// ── Time window ──────────────────────────────────────────────────────
// Pinned end-of-window. Only changes on: page entry, window-size pick,
// manual refresh. No global auto-refresh ticker here — alarms is a
// triage view, not a wall-board, and a constantly-shifting `now`
// invalidates any time-range selection the operator is making.
type WindowKey = '1h' | '6h' | '24h';
const WINDOW_MS: Record<WindowKey, number> = {
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};
/* Per-call MQE bucket cap. OAP's MINUTE-step `execExpression`
 * returns a fixed-size value array (~100 buckets) regardless of the
 * requested duration — beyond that it pads with nulls anchored at
 * the START of the requested window, leaving the recent portion
 * empty. To paint a continuous traffic line across longer windows
 * we slice the window into ≤90-minute chunks and merge the per-
 * chunk responses into the cache. 90 leaves headroom under the cap;
 * 100 ran right at the edge on demo OAP. */
const TRAFFIC_CHUNK_MS = 90 * 60_000;
const TRAFFIC_DELTA_MS = 60 * 60_000;
/* Cap concurrent chunk requests so OAP doesn't see a fan-out of
 * (chunks × services) MQE calls in one breath. 3 is a balance:
 * 6h = 4 chunks → finishes in two batches; 24h = 16 chunks → six
 * batches. Higher would shave wall-time but pressure demo OAP. */
const TRAFFIC_CHUNK_CONCURRENCY = 3;

const windowChoice = ref<WindowKey>('6h');
const windowEndAt = ref<number>(Date.now());
const startTime = computed<number>(() => windowEndAt.value - WINDOW_MS[windowChoice.value]);
const endTime = computed<number>(() => windowEndAt.value);

// ── Filters (cascading: layer → service → {instance, endpoint}) ─────
// Two layers of state:
//   - `draft*`     — what the operator is currently picking. Drives
//                    the cascade dropdowns AND the dependent picker
//                    queries (services for the picked layer, etc.)
//                    but NOT the alarms query.
//   - `applied*`   — what the alarms query actually filters by.
//                    Updated only by the Apply button (or Clear).
// This split keeps the alarms list stable while the operator is
// composing a multi-step filter; nothing fires until they hit Apply.
interface FilterValues {
  layer: string;
  service: string;
  instance: string;
  endpoint: string;
}
function emptyFilters(): FilterValues {
  return { layer: '', service: '', instance: '', endpoint: '' };
}
const draft = ref<FilterValues>(emptyFilters());
const applied = ref<FilterValues>(emptyFilters());

const { availableLayers } = useLayers();

const servicesQuery = useQuery({
  queryKey: computed(() => ['alarms/services', draft.value.layer]),
  queryFn: () => bff.alarms.services(draft.value.layer),
  enabled: computed(() => draft.value.layer.length > 0),
  staleTime: 30_000,
});
const serviceOptions = computed<string[]>(
  () => (servicesQuery.data.value?.services ?? []).map((s) => s.name),
);

/* The /api/layer/:key/instances + /endpoints routes both want the
 * service NAME (they accept either id or name); we pass the picked
 * service through directly. Bound to draft, not applied — the user
 * needs the cascade to populate as they pick. */
const instancesQuery = useQuery({
  queryKey: computed(() => ['alarms/instances', draft.value.layer, draft.value.service]),
  queryFn: () => bffClient.layer.instances(draft.value.layer, draft.value.service),
  enabled: computed(() => draft.value.layer.length > 0 && draft.value.service.length > 0),
  staleTime: 30_000,
});
const instanceOptions = computed<string[]>(
  () => (instancesQuery.data.value?.instances ?? []).map((i) => i.name),
);

const endpointsQuery = useQuery({
  queryKey: computed(() => ['alarms/endpoints', draft.value.layer, draft.value.service]),
  // Empty query string returns the top-N most-trafficked endpoints —
  // good enough as a starter list; operator can type to filter.
  queryFn: () => bffClient.layer.endpoints(draft.value.layer, draft.value.service, '', 50),
  enabled: computed(() => draft.value.layer.length > 0 && draft.value.service.length > 0),
  staleTime: 30_000,
});
const endpointOptions = computed<string[]>(
  () => (endpointsQuery.data.value?.endpoints ?? []).map((e) => e.name),
);

function onLayerChange(): void {
  draft.value.service = '';
  draft.value.instance = '';
  draft.value.endpoint = '';
}
function onServiceChange(): void {
  draft.value.instance = '';
  draft.value.endpoint = '';
}
function applyFilters(): void {
  applied.value = { ...draft.value };
}
function clearFilters(): void {
  draft.value = emptyFilters();
  applied.value = emptyFilters();
}
const hasFilter = computed<boolean>(
  () => !!draft.value.layer || !!applied.value.layer,
);
/* Apply is disabled when the draft already matches what's applied —
 * no point firing the same query twice. Also lets the button serve
 * as a "saved/dirty" indicator at a glance. */
const isDirty = computed<boolean>(() => {
  const d = draft.value;
  const a = applied.value;
  return d.layer !== a.layer || d.service !== a.service || d.instance !== a.instance || d.endpoint !== a.endpoint;
});

// ── Selection ────────────────────────────────────────────────────────
// One alarm OR a time range — mutually exclusive. Clicking a flag on
// the timeline picks an alarm; brushing picks a range and clears any
// selected alarm; clicking outside the timeline clears both.
//
// Selection is keyed by `<id>::<startTime>` not `id` alone — OAP's
// AlarmMessage.id is `<entityBase64>.<ruleNumber>`, which collapses
// every firing of the same rule on the same entity to one identifier.
// A single row's id can therefore appear N times in the same window
// (one per firing). Using id alone would light up every sibling row
// when the operator clicks one.
function keyFor(a: AlarmMessage): string {
  return `${a.id}::${a.startTime}`;
}

const selectedAlarmKey = ref<string | null>(null);
const selectedRange = ref<{ startTime: number; endTime: number } | null>(null);

function selectAlarm(key: string): void {
  selectedAlarmKey.value = key;
  selectedRange.value = null;
}
function selectRange(r: { startTime: number; endTime: number }): void {
  selectedRange.value = r;
  selectedAlarmKey.value = null;
}
function clearSelection(): void {
  selectedAlarmKey.value = null;
  selectedRange.value = null;
}

// ── Queries ──────────────────────────────────────────────────────────
const alarmsQuery = useQuery({
  // queryKey reads `applied`, not `draft` — typing/picking in the
  // filter row doesn't fire a query; only Apply does (or the window
  // picker, or the Refresh button).
  queryKey: computed(() => [
    'alarms',
    startTime.value,
    endTime.value,
    applied.value.service,
    applied.value.instance,
    applied.value.endpoint,
  ]),
  queryFn: (): Promise<AlarmsResponse> =>
    bff.alarms.list({
      startTime: startTime.value,
      endTime: endTime.value,
      // Conservative pageSize — some OAP storage backends throw on
      // larger pages (`fail to query stream`). 30 is comfortably under
      // every cap I've seen and still gives a screenful of triage rows.
      // Operator-paged "load more" can come later.
      pageSize: 30,
      service: applied.value.service || undefined,
      instance: applied.value.instance || undefined,
      endpoint: applied.value.endpoint || undefined,
    }),
  // No refetchInterval — alarms is a triage view. Refresh happens on
  // entry, on Apply, on window-picker change, and on the Refresh
  // button. A constantly-shifting list would invalidate any selection
  // the operator is making.
  staleTime: Infinity,
  refetchOnWindowFocus: false,
});

// ── Traffic background — chunked + delta-update ─────────────────────
// OAP's MQE has a per-step bucket cap (`MINUTE` step = 360 buckets =
// 6h). To cover longer windows (24h) we fire one BFF request per
// 6-hour chunk and stitch the results into a per-layer
// `Map<bucketMs, value>` cache. The chart series derive from the
// cache filtered to the current visible window.
//
// On manual refresh we re-fetch only the trailing 1h chunk and merge
// the new points into the cache (delta). That keeps the chart fresh
// without re-firing every chunk against OAP — important for the 24h
// view which would otherwise issue four MQE blasts on every refresh.
interface CachedLayer {
  layerKey: string;
  label: string;
  present: boolean;
  error?: string;
  /** ms-bucket → value. Single source of truth for the chart. */
  points: Map<number, number | null>;
}

const trafficCache = ref<Map<string, CachedLayer>>(new Map());
const trafficLoading = ref(false);
const trafficError = ref<string | null>(null);

function splitIntoChunks(start: number, end: number, chunkMs: number): Array<{ start: number; end: number }> {
  const chunks: Array<{ start: number; end: number }> = [];
  let s = start;
  while (s < end) {
    const e = Math.min(s + chunkMs, end);
    chunks.push({ start: s, end: e });
    s = e;
  }
  return chunks;
}

async function fetchTrafficChunk(s: number, e: number): Promise<void> {
  const resp = await bff.alarms.traffic(s, e);
  for (const series of resp.series) {
    let cached = trafficCache.value.get(series.layerKey);
    if (!cached) {
      cached = {
        layerKey: series.layerKey,
        label: series.label,
        present: series.present,
        error: series.error,
        points: new Map(),
      };
      trafficCache.value.set(series.layerKey, cached);
    } else {
      // Refresh the metadata in case it changed (e.g. layer was empty
      // earlier in the window but is now present).
      cached.label = series.label;
      cached.present = cached.present || series.present;
      cached.error = series.error;
    }
    for (const p of series.points) {
      cached.points.set(p.ts, p.value);
    }
  }
  // Trigger reactivity — `ref<Map>` mutations don't auto-notify Vue.
  trafficCache.value = new Map(trafficCache.value);
}

/** Drop everything and fire every chunk for the current window.
 *  Bounded-parallel via a tiny worker pool so a 24h window doesn't
 *  blast ~16 graphql calls at OAP simultaneously. */
async function runWithLimit<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const next = async (): Promise<void> => {
    while (true) {
      const idx = cursor++;
      if (idx >= items.length) return;
      await fn(items[idx]);
    }
  };
  const workers: Promise<void>[] = [];
  for (let w = 0; w < Math.min(limit, items.length); w++) workers.push(next());
  await Promise.all(workers);
}

async function loadTrafficFull(): Promise<void> {
  trafficCache.value = new Map();
  trafficError.value = null;
  trafficLoading.value = true;
  try {
    const chunks = splitIntoChunks(startTime.value, endTime.value, TRAFFIC_CHUNK_MS);
    await runWithLimit(chunks, TRAFFIC_CHUNK_CONCURRENCY, (c) =>
      fetchTrafficChunk(c.start, c.end),
    );
  } catch (err) {
    trafficError.value = err instanceof Error ? err.message : String(err);
  } finally {
    trafficLoading.value = false;
  }
}

/** Fetch the trailing TRAFFIC_DELTA_MS window and merge — used by
 *  the Refresh button. Cache for older buckets is reused. */
async function loadTrafficDelta(): Promise<void> {
  trafficError.value = null;
  trafficLoading.value = true;
  try {
    const start = Math.max(startTime.value, endTime.value - TRAFFIC_DELTA_MS);
    await fetchTrafficChunk(start, endTime.value);
    // Trim cache points that fell out of the visible window so the
    // map doesn't grow unbounded across many refreshes.
    for (const cached of trafficCache.value.values()) {
      for (const ts of Array.from(cached.points.keys())) {
        if (ts < startTime.value) cached.points.delete(ts);
      }
    }
  } catch (err) {
    trafficError.value = err instanceof Error ? err.message : String(err);
  } finally {
    trafficLoading.value = false;
  }
}

// ── Derived data ─────────────────────────────────────────────────────
const alarms = computed<AlarmMessage[]>(() => alarmsQuery.data.value?.msgs ?? []);

const firingCount = computed<number>(
  () => alarms.value.filter((a) => a.recoveryTime === null).length,
);
const totalCount = computed<number>(() => alarms.value.length);
const layersWithAlarms = computed<number>(
  () => new Set(alarms.value.map((a) => a.layerKey ?? 'other')).size,
);

/* Derive chart-shaped series from the per-layer cache. Sorted by ts
 * within each layer; filtered to the current visible window so old
 * cache buckets don't bleed into the chart after a window-size
 * change. */
const trafficSeries = computed<AlarmTrafficSeries[]>(() => {
  const out: AlarmTrafficSeries[] = [];
  const s = startTime.value;
  const e = endTime.value;
  for (const cached of trafficCache.value.values()) {
    const tsList = Array.from(cached.points.keys()).sort((a, b) => a - b);
    const points: AlarmTrafficPoint[] = [];
    for (const ts of tsList) {
      if (ts >= s && ts <= e) {
        points.push({ ts, value: cached.points.get(ts) ?? null });
      }
    }
    out.push({
      layerKey: cached.layerKey,
      label: cached.label,
      present: cached.present,
      error: cached.error,
      points,
    });
  }
  return out;
});
/* Chart x-axis spans the un-rounded request window — not the BFF's
 * minute-floored echo. Using the user-requested bounds means the
 * axis always reads as the picker (1h / 6h / 24h) even if OAP only
 * has partial data, so the operator's mental model of "where in
 * time am I looking?" stays stable. */
const trafficStart = computed<number>(() => startTime.value);
const trafficEnd = computed<number>(() => endTime.value);

/** Filtered list — narrows by the current selection (range or alarm). */
const filteredAlarms = computed<AlarmMessage[]>(() => {
  if (selectedRange.value) {
    const { startTime: s, endTime: e } = selectedRange.value;
    return alarms.value.filter((a) => a.startTime >= s && a.startTime <= e);
  }
  return alarms.value;
});

const selectedAlarm = computed<AlarmMessage | null>(() => {
  const k = selectedAlarmKey.value;
  if (!k) return null;
  return alarms.value.find((a) => keyFor(a) === k) ?? null;
});

/** Group filtered alarms by layer (or "Other" when the BFF couldn't
 *  resolve the entity's layer). Sorted descending by firing count
 *  then total count so the noisiest layer floats to the top. */
interface LayerGroup {
  key: string;
  label: string;
  firing: number;
  alarms: AlarmMessage[];
}
const grouped = computed<LayerGroup[]>(() => {
  const map = new Map<string, AlarmMessage[]>();
  for (const a of filteredAlarms.value) {
    const k = a.layerKey ?? 'OTHER';
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(a);
  }
  const groups: LayerGroup[] = [];
  for (const [key, list] of map.entries()) {
    const firing = list.filter((a) => a.recoveryTime === null).length;
    list.sort((a, b) => b.startTime - a.startTime);
    groups.push({
      key,
      label: prettyLayer(key),
      firing,
      alarms: list,
    });
  }
  groups.sort((a, b) => b.firing - a.firing || b.alarms.length - a.alarms.length);
  return groups;
});

function prettyLayer(key: string): string {
  if (key === 'OTHER') return 'Other';
  return key
    .toLowerCase()
    .split('_')
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : ''))
    .join(' ');
}

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

watch([startTime, endTime], () => {
  // Window change clears any time-range brush — the brush is bound to
  // the previous window's coordinates so it'd be meaningless after a
  // resize. Alarm selection survives.
  selectedRange.value = null;
});

// ── Lifecycle / refresh wiring ──────────────────────────────────────
// Auto-fetch on mount; reload traffic in full whenever the operator
// changes the window size (1h/6h/24h). The Refresh button below
// advances `windowEndAt` to NOW and fires the trailing-1h delta.
onMounted(() => {
  void loadTrafficFull();
});

watch(windowChoice, () => {
  windowEndAt.value = Date.now();
  void loadTrafficFull();
});

const refreshing = ref(false);
async function onRefresh(): Promise<void> {
  if (refreshing.value) return;
  refreshing.value = true;
  try {
    windowEndAt.value = Date.now();
    // Traffic: delta-merge last TRAFFIC_DELTA_MS only.
    await Promise.all([loadTrafficDelta(), alarmsQuery.refetch()]);
  } finally {
    refreshing.value = false;
  }
}
</script>

<template>
  <div class="ax">
    <header class="ax__head">
      <div>
        <div class="ax__kicker">Alarms</div>
        <h1 class="ax__h1">Active alarms</h1>
        <p class="ax__lede">
          Background lines show RPM per configured layer. Markers anchor at each alarm's start
          time. Click a marker to inspect a single alarm; brush a region on the timeline to list
          alarms in that window. Configure the layers + MQEs in
          <RouterLink to="/admin/alert-page-setup">Alert page setup</RouterLink>.
        </p>
      </div>
      <div class="ax__header-actions">
        <div class="ax__window">
          <button
            v-for="w in (['1h', '6h', '24h'] as WindowKey[])"
            :key="w"
            type="button"
            class="ax__window-btn"
            :class="{ active: windowChoice === w }"
            @click="windowChoice = w"
          >{{ w }}</button>
        </div>
        <button
          type="button"
          class="ax__refresh"
          :disabled="refreshing || trafficLoading"
          @click="onRefresh"
        >{{ refreshing || trafficLoading ? 'refreshing…' : 'refresh' }}</button>
      </div>
    </header>

    <!-- ── Filters ──────────────────────────────────────────────────── -->
    <!-- Cascading: layer → service → {instance, endpoint}. Each tier
         is disabled until its parent is set; changing a parent clears
         all descendants so a stale child can't survive. Nothing
         actually fires the alarms query until the operator hits Apply
         — typing / picking just composes the draft. -->
    <div class="ax__filters">
      <label class="ax__filter">
        <span>Layer</span>
        <select v-model="draft.layer" @change="onLayerChange">
          <option value="">any layer</option>
          <option v-for="L in availableLayers" :key="L.key" :value="L.key.toUpperCase()">
            {{ L.name }}
          </option>
        </select>
      </label>
      <label class="ax__filter" :class="{ 'is-disabled': !draft.layer }">
        <span>Service</span>
        <select v-model="draft.service" :disabled="!draft.layer" @change="onServiceChange">
          <option value="">
            {{ !draft.layer ? 'pick a layer first' : servicesQuery.isFetching.value ? 'loading…' : 'any service' }}
          </option>
          <option v-for="name in serviceOptions" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="ax__filter" :class="{ 'is-disabled': !draft.service }">
        <span>Instance</span>
        <select v-model="draft.instance" :disabled="!draft.service">
          <option value="">
            {{ !draft.service ? 'pick a service first' : instancesQuery.isFetching.value ? 'loading…' : 'any instance' }}
          </option>
          <option v-for="name in instanceOptions" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <label class="ax__filter" :class="{ 'is-disabled': !draft.service }">
        <span>Endpoint</span>
        <select v-model="draft.endpoint" :disabled="!draft.service">
          <option value="">
            {{ !draft.service ? 'pick a service first' : endpointsQuery.isFetching.value ? 'loading…' : 'any endpoint' }}
          </option>
          <option v-for="name in endpointOptions" :key="name" :value="name">{{ name }}</option>
        </select>
      </label>
      <button
        type="button"
        class="ax__filter-apply"
        :class="{ 'is-dirty': isDirty }"
        :disabled="!isDirty"
        @click="applyFilters"
      >{{ isDirty ? 'apply' : 'applied' }}</button>
      <button
        v-if="hasFilter"
        type="button"
        class="ax__filter-clear"
        @click="clearFilters"
      >clear</button>
    </div>

    <!-- ── KPI strip ────────────────────────────────────────────────── -->
    <div class="ax__kpis">
      <div class="ax__kpi">
        <div class="ax__kpi-label">Firing</div>
        <div class="ax__kpi-val ax__kpi-val--err">{{ firingCount }}</div>
      </div>
      <div class="ax__kpi">
        <div class="ax__kpi-label">Window total</div>
        <div class="ax__kpi-val">{{ totalCount }}</div>
      </div>
      <div class="ax__kpi">
        <div class="ax__kpi-label">Layers affected</div>
        <div class="ax__kpi-val">{{ layersWithAlarms }}</div>
      </div>
      <div class="ax__kpi">
        <div class="ax__kpi-label">Selection</div>
        <div class="ax__kpi-val ax__kpi-val--small">
          <template v-if="selectedAlarm">{{ selectedAlarm.id }}</template>
          <template v-else-if="selectedRange">
            {{ Math.round((selectedRange.endTime - selectedRange.startTime) / 60_000) }}m window
          </template>
          <template v-else>—</template>
        </div>
      </div>
    </div>

    <!-- ── Timeline ─────────────────────────────────────────────────── -->
    <section class="ax__panel">
      <header class="ax__panel-head">
        <h3>Timeline</h3>
        <span v-if="trafficLoading || alarmsQuery.isFetching.value" class="ax__refreshing">
          {{ trafficLoading ? 'loading traffic…' : 'loading alarms…' }}
        </span>
        <span v-else-if="trafficError" class="ax__panel-err">{{ trafficError }}</span>
      </header>
      <AlarmsTimeline
        :traffic="trafficSeries"
        :alarms="alarms"
        :start-time="trafficStart"
        :end-time="trafficEnd"
        :selected-alarm-key="selectedAlarmKey"
        :height="220"
        @select-alarm="selectAlarm"
        @select-time-range="selectRange"
        @clear-selection="clearSelection"
      />
    </section>

    <!-- ── Grouped list + detail ───────────────────────────────────── -->
    <section class="ax__split">
      <div class="ax__list">
        <header class="ax__list-head">
          <h3>
            {{ filteredAlarms.length }} alarm{{ filteredAlarms.length === 1 ? '' : 's' }}
            <template v-if="selectedRange">
              in selection
            </template>
            <template v-else>
              in window
            </template>
          </h3>
          <button
            v-if="selectedRange || selectedAlarmKey"
            type="button"
            class="ax__clear-sel"
            @click="clearSelection"
          >clear selection</button>
        </header>

        <div v-if="alarmsQuery.isPending.value" class="ax__empty">loading…</div>
        <div v-else-if="grouped.length === 0" class="ax__empty">No alarms in the current window.</div>

        <section
          v-for="g in grouped"
          :key="g.key"
          class="ax__group"
        >
          <header class="ax__group-head">
            <span class="ax__group-label">{{ g.label }}</span>
            <span v-if="g.firing > 0" class="sw-badge is-err">
              <span class="state-dot" />{{ g.firing }} firing
            </span>
            <span class="ax__group-count">{{ g.alarms.length }}</span>
          </header>
          <ul class="ax__rows">
            <li
              v-for="a in g.alarms"
              :key="keyFor(a)"
              class="ax__row"
              :class="{ active: keyFor(a) === selectedAlarmKey, resolved: a.recoveryTime !== null }"
              @click="selectAlarm(keyFor(a))"
            >
              <span
                class="ax__sev"
                :class="a.recoveryTime === null ? 'is-err' : 'is-ok'"
              />
              <div class="ax__row-main">
                <div class="ax__row-msg">{{ a.message }}</div>
                <div class="ax__row-meta">
                  <code>{{ a.name }}</code>
                  <span v-if="a.scope" class="ax__row-tag">{{ a.scope }}</span>
                  <span class="ax__row-time">{{ formatRelative(a.startTime) }}</span>
                </div>
              </div>
              <span
                class="sw-badge"
                :class="a.recoveryTime === null ? 'is-err' : 'is-ok'"
              >
                <span class="state-dot" />{{ a.recoveryTime === null ? 'firing' : 'recovered' }}
              </span>
            </li>
          </ul>
        </section>
      </div>

      <AlarmDetailPanel :alarm="selectedAlarm" />
    </section>
  </div>
</template>

<style scoped>
.ax {
  padding: 20px 20px 60px;
  max-width: 1600px;
  margin: 0 auto;
}
.ax__head {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 16px;
}
.ax__head > div:first-child {
  flex: 1;
}
.ax__kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sw-accent);
  margin-bottom: 4px;
}
.ax__h1 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--sw-fg-0);
  margin: 0 0 8px;
}
.ax__lede {
  font-size: 12.5px;
  color: var(--sw-fg-1);
  line-height: 1.5;
  margin: 0;
  max-width: 820px;
}
.ax__lede a {
  color: var(--sw-accent);
  text-decoration: none;
}
.ax__lede a:hover {
  text-decoration: underline;
}
.ax__header-actions {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.ax__window {
  display: flex;
  gap: 2px;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 6px;
  padding: 3px;
}
.ax__window-btn {
  background: transparent;
  border: 0;
  color: var(--sw-fg-2);
  font: inherit;
  font-size: 11.5px;
  padding: 4px 12px;
  border-radius: 4px;
  cursor: pointer;
}
.ax__window-btn:hover {
  color: var(--sw-fg-0);
}
.ax__window-btn.active {
  background: var(--sw-bg-3);
  color: var(--sw-fg-0);
}
.ax__refresh {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line-2);
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 11.5px;
  padding: 0 14px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}
.ax__refresh:not(:disabled):hover {
  background: var(--sw-bg-2);
  border-color: var(--sw-accent);
}
.ax__refresh:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Filter row — chip-style: dark surface, compact label inside the
 * chip, no native select chevron. Each chip is a fixed-width tile
 * with the label as a quiet kicker above the value. Disabled state
 * dims the chip and hides the caret so operators can see at a glance
 * which selectors are gated. */
.ax__filters {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: stretch;
  margin-bottom: 14px;
  padding: 10px;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
}
.ax__filter {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 180px;
  padding: 6px 10px;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line);
  border-radius: 5px;
  transition: border-color 0.1s ease;
  cursor: pointer;
}
.ax__filter:hover:not(.is-disabled) {
  border-color: var(--sw-line-3, var(--sw-line-2));
}
.ax__filter:focus-within:not(.is-disabled) {
  border-color: var(--sw-accent);
}
.ax__filter.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.ax__filter > span {
  font-size: 9.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-3);
  font-weight: 600;
}
.ax__filter select {
  -webkit-appearance: none;
  -moz-appearance: none;
  appearance: none;
  background: transparent
    url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 10 6' width='10' height='6'><path d='M1 1l4 4 4-4' stroke='%23818a9c' stroke-width='1.4' fill='none' stroke-linecap='round'/></svg>")
    right 2px center / 9px no-repeat;
  border: 0;
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 12px;
  padding: 1px 16px 1px 0;
  margin: 0;
  width: 100%;
  cursor: pointer;
  outline: none;
}
.ax__filter select:disabled {
  cursor: not-allowed;
  background-image: none;
  color: var(--sw-fg-2);
}
.ax__filter-apply {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line-2);
  color: var(--sw-fg-2);
  font: inherit;
  font-size: 11.5px;
  font-weight: 500;
  padding: 0 16px;
  border-radius: 5px;
  cursor: pointer;
  margin-left: auto;
  transition: all 0.1s ease;
}
.ax__filter-apply.is-dirty {
  background: var(--sw-accent);
  border-color: var(--sw-accent);
  color: #0a0d12;
  font-weight: 600;
}
.ax__filter-apply.is-dirty:hover {
  background: var(--sw-accent-light, #fb923c);
}
.ax__filter-apply:disabled {
  cursor: default;
}
.ax__filter-clear {
  align-self: stretch;
  display: inline-flex;
  align-items: center;
  background: transparent;
  border: 1px dashed var(--sw-line-2);
  color: var(--sw-fg-2);
  font: inherit;
  font-size: 11px;
  padding: 0 14px;
  border-radius: 5px;
  cursor: pointer;
}
.ax__filter-clear:hover {
  background: var(--sw-bg-2);
  color: var(--sw-fg-0);
  border-style: solid;
  border-color: var(--sw-line-2);
}

.ax__kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
  margin-bottom: 14px;
}
.ax__kpi {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
  padding: 10px 14px;
}
.ax__kpi-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-3);
}
.ax__kpi-val {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--sw-fg-0);
  margin-top: 2px;
  font-variant-numeric: tabular-nums;
}
.ax__kpi-val--err {
  color: var(--sw-err);
}
.ax__kpi-val--small {
  font-size: 12.5px;
  font-family: var(--sw-mono);
  font-weight: 500;
}

.ax__panel {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}
.ax__panel-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
  padding: 0 4px;
}
.ax__panel-head h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--sw-fg-1);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}
.ax__refreshing {
  margin-left: auto;
  font-size: 11px;
  color: var(--sw-fg-3);
  font-style: italic;
}
.ax__panel-err {
  margin-left: auto;
  font-size: 11px;
  color: var(--sw-err);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60%;
}

.ax__split {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
}
.ax__list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ax__list-head {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ax__list-head h3 {
  font-size: 12px;
  font-weight: 600;
  color: var(--sw-fg-1);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin: 0;
}
.ax__clear-sel {
  background: transparent;
  border: 1px solid var(--sw-line-2);
  color: var(--sw-fg-2);
  font: inherit;
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 4px;
  cursor: pointer;
  margin-left: auto;
}
.ax__clear-sel:hover {
  background: var(--sw-bg-2);
  color: var(--sw-fg-0);
}
.ax__empty {
  padding: 24px;
  text-align: center;
  font-size: 12px;
  color: var(--sw-fg-3);
  background: var(--sw-bg-1);
  border: 1px dashed var(--sw-line);
  border-radius: 8px;
}
.ax__group {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
  overflow: hidden;
}
.ax__group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--sw-bg-2);
  border-bottom: 1px solid var(--sw-line);
}
.ax__group-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--sw-fg-0);
  flex: 1;
}
.ax__group-count {
  font-size: 11px;
  color: var(--sw-fg-3);
  background: var(--sw-bg-1);
  border-radius: 10px;
  padding: 1px 8px;
}
.ax__rows {
  list-style: none;
  margin: 0;
  padding: 0;
}
.ax__row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sw-line);
  cursor: pointer;
  transition: background 0.1s ease;
}
.ax__row:last-child {
  border-bottom: none;
}
.ax__row:hover {
  background: var(--sw-bg-2);
}
.ax__row.active {
  background: var(--sw-bg-3);
  box-shadow: inset 2px 0 0 var(--sw-accent);
}
.ax__row.resolved {
  opacity: 0.65;
}
.ax__sev {
  width: 3px;
  height: 26px;
  border-radius: 2px;
  flex-shrink: 0;
}
.ax__sev.is-err {
  background: var(--sw-err);
}
.ax__sev.is-ok {
  background: var(--sw-ok);
}
.ax__row-main {
  flex: 1;
  min-width: 0;
}
.ax__row-msg {
  font-size: 12.5px;
  color: var(--sw-fg-0);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ax__row-meta {
  font-size: 11px;
  color: var(--sw-fg-3);
  display: flex;
  gap: 8px;
  align-items: center;
  margin-top: 3px;
}
.ax__row-meta code {
  font-family: var(--sw-mono);
  font-size: 10.5px;
  color: var(--sw-fg-1);
  background: var(--sw-bg-2);
  padding: 1px 5px;
  border-radius: 3px;
}
.ax__row-tag {
  font-size: 10px;
  color: var(--sw-fg-2);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ax__row-time {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
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
