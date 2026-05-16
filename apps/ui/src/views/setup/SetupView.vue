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
  Admin · Overview setup. Lists every overview dashboard bundled with
  the BFF (Services / Mesh / OAP / Satellite / Java Agent / Go Agent
  in the default install). Selecting one opens a read-only summary of
  its config: visibility, referenced layers, widget breakdown.

  Editing is intentionally read-only in v1 — overview dashboards are
  bundled JSON files in `apps/bff/src/bundled_templates/overviews/`
  and a future iteration will land a JSON editor + write endpoint so
  operators can override them through the UI. For now this page is the
  catalogue + provenance view; edits happen by patching the bundled
  JSON.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import type { OverviewDashboard, OverviewWidget } from '@skywalking-horizon-ui/api-client';
import { bffClient } from '@/api/client';
import { useOverviewDashboards } from '@/composables/useOverviewDashboards';

const { isLoading, all, publicOverviews, operateOverviews } = useOverviewDashboards();

const selectedId = ref<string>('');
watch(
  all,
  (rows) => {
    if (rows.length === 0) {
      selectedId.value = '';
      return;
    }
    if (!rows.some((d) => d.id === selectedId.value)) {
      selectedId.value = rows[0].id;
    }
  },
  { immediate: true },
);

const selectedListEntry = computed(
  () => all.value.find((d) => d.id === selectedId.value) ?? null,
);

const detailQuery = useQuery({
  queryKey: ['overview-dashboard-detail', selectedId],
  queryFn: () => bffClient.overviewDashboard(selectedId.value),
  enabled: computed(() => selectedId.value.length > 0),
  staleTime: 60_000,
});

const detail = computed<OverviewDashboard | null>(
  () => detailQuery.data.value?.dashboard ?? null,
);

const widgetSummary = computed(() => {
  const widgets: OverviewWidget[] = detail.value?.widgets ?? [];
  const counts = new Map<string, number>();
  for (const w of widgets) counts.set(w.type, (counts.get(w.type) ?? 0) + 1);
  return Array.from(counts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => a.type.localeCompare(b.type));
});

/** Collapsible rail toggle — same pattern as /admin/layer-dashboards. */
const listOpen = ref(true);
</script>

<template>
  <div class="setup">
    <header class="page-head">
      <div>
        <div class="kicker">Admin · Overview setup</div>
        <h1>Overview dashboards</h1>
        <p class="lede">
          Cross-layer dashboards that appear in the top of the sidebar (public) or
          under the Admin section (operate-only). Bundled with the BFF — edit the
          source JSON under
          <code>apps/bff/src/bundled_templates/overviews/</code> to change a
          dashboard, then restart for the change to take effect.
        </p>
      </div>
    </header>

    <div v-if="all.length === 0 && !isLoading" class="empty">
      <div class="empty-card">
        <h2>No overview dashboards loaded</h2>
        <p>
          The BFF didn't return any overview dashboards. Check that
          <code>apps/bff/src/bundled_templates/overviews/*.json</code> are reachable
          from the running BFF.
        </p>
      </div>
    </div>

    <div v-else class="grid" :class="{ 'list-collapsed': !listOpen }">
      <aside class="sw-card list" :class="{ collapsed: !listOpen }">
        <div class="list-head">
          <button
            class="list-toggle"
            type="button"
            :title="listOpen ? 'Collapse the dashboards list' : 'Expand the dashboards list'"
            @click="listOpen = !listOpen"
          >
            <span class="caret" :class="{ open: listOpen }">›</span>
          </button>
          <h4 v-if="listOpen">Dashboards</h4>
          <span v-if="listOpen" class="sub">
            {{ all.length }} bundled
          </span>
        </div>

        <template v-if="listOpen">
          <template v-if="publicOverviews.length > 0">
            <div class="kicker-row">Public</div>
            <button
              v-for="d in publicOverviews"
              :key="d.id"
              class="row"
              :class="{ active: selectedId === d.id }"
              @click="selectedId = d.id"
            >
              <span class="dot pub" />
              <span class="name">{{ d.title }}</span>
              <span class="count">{{ d.widgetCount }}</span>
            </button>
          </template>
          <template v-if="operateOverviews.length > 0">
            <div class="kicker-row">Operate</div>
            <button
              v-for="d in operateOverviews"
              :key="d.id"
              class="row"
              :class="{ active: selectedId === d.id }"
              @click="selectedId = d.id"
            >
              <span class="dot op" />
              <span class="name">{{ d.title }}</span>
              <span class="count">{{ d.widgetCount }}</span>
            </button>
          </template>
        </template>
        <template v-else>
          <button
            v-for="d in all"
            :key="d.id"
            class="row collapsed-row"
            :class="{ active: selectedId === d.id }"
            :title="d.title"
            @click="selectedId = d.id"
          >
            <span class="dot" :class="d.visibility === 'operate' ? 'op' : 'pub'" />
          </button>
        </template>
      </aside>

      <main class="detail">
        <div v-if="!selectedListEntry" class="placeholder sw-card">
          Select a dashboard on the left to inspect its config.
        </div>
        <template v-else>
          <section class="sw-card meta">
            <header class="meta-head">
              <div>
                <h3>{{ selectedListEntry.title }}</h3>
                <div class="meta-sub">
                  <span
                    class="sw-badge"
                    :class="selectedListEntry.visibility === 'operate' ? 'warn' : 'ok'"
                  >
                    {{ selectedListEntry.visibility === 'operate' ? 'Operate' : 'Public' }}
                  </span>
                  <span class="meta-key">id: <code>{{ selectedListEntry.id }}</code></span>
                  <span
                    v-if="typeof selectedListEntry.order === 'number'"
                    class="meta-key"
                  >
                    order: {{ selectedListEntry.order }}
                  </span>
                </div>
              </div>
              <RouterLink class="sw-btn small" :to="`/overview/${selectedListEntry.id}`">
                Open dashboard →
              </RouterLink>
            </header>
            <p v-if="selectedListEntry.description" class="desc">
              {{ selectedListEntry.description }}
            </p>
            <div v-if="(selectedListEntry.layers ?? []).length > 0" class="layers">
              <span class="layers-label">Layers</span>
              <span
                v-for="L in selectedListEntry.layers ?? []"
                :key="L"
                class="layer-chip"
              >
                {{ L }}
              </span>
            </div>
          </section>

          <section class="sw-card widgets">
            <header class="sec-head">
              <h4>Widget breakdown</h4>
              <span class="sub">{{ selectedListEntry.widgetCount }} widgets</span>
            </header>
            <div v-if="detailQuery.isLoading.value" class="loading">Loading widget detail…</div>
            <div v-else-if="detail" class="widget-list">
              <div v-if="widgetSummary.length > 0" class="summary-row">
                <span
                  v-for="entry in widgetSummary"
                  :key="entry.type"
                  class="type-chip"
                >
                  {{ entry.type }} <b>{{ entry.count }}</b>
                </span>
              </div>
              <table class="widget-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Title</th>
                    <th>Type</th>
                    <th>Layer</th>
                    <th>Span</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="w in detail.widgets" :key="w.id">
                    <td><code>{{ w.id }}</code></td>
                    <td>{{ w.title }}</td>
                    <td>{{ w.type }}</td>
                    <td>{{ w.layer ?? '—' }}</td>
                    <td>
                      <span v-if="w.span">{{ w.span }}</span>
                      <span v-if="w.rowSpan">×{{ w.rowSpan }}</span>
                      <span v-if="!w.span && !w.rowSpan">—</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section class="sw-card note">
            <p>
              <strong>Editing</strong>: overview dashboards are bundled JSON files.
              To customise this dashboard, edit
              <code>apps/bff/src/bundled_templates/overviews/{{ selectedListEntry.id }}.json</code>
              and restart the BFF. A JSON editor in the UI is planned for a later phase.
            </p>
          </section>
        </template>
      </main>
    </div>
  </div>
</template>

<style scoped>
.setup { padding: 20px 20px 60px; max-width: 1440px; margin: 0 auto; }
.page-head { margin-bottom: 18px; }
.kicker {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--sw-accent); margin-bottom: 6px;
}
.page-head h1 {
  font-size: 22px; font-weight: 600; letter-spacing: -0.02em; color: var(--sw-fg-0);
  margin: 0 0 6px;
}
.lede {
  font-size: 12px; color: var(--sw-fg-2); line-height: 1.5; margin: 0; max-width: 720px;
}
.lede code {
  font-family: var(--sw-mono); font-size: 11px; padding: 0 4px; border-radius: 3px;
  background: var(--sw-bg-2); color: var(--sw-fg-1);
}

.empty { margin-top: 20px; }
.empty-card {
  background: var(--sw-bg-1); border: 1px dashed var(--sw-line-2); border-radius: 10px;
  padding: 28px; text-align: center; max-width: 600px; margin: 0 auto;
}
.empty-card h2 { font-size: 15px; color: var(--sw-fg-0); margin: 0 0 6px; }
.empty-card p { font-size: 12px; color: var(--sw-fg-2); margin: 0; }
.empty-card code {
  font-family: var(--sw-mono); font-size: 11px; padding: 0 4px; border-radius: 3px;
  background: var(--sw-bg-2); color: var(--sw-fg-1);
}

.grid {
  display: grid; grid-template-columns: 240px 1fr; gap: 14px; align-items: start;
  transition: grid-template-columns 160ms ease;
}
.grid.list-collapsed { grid-template-columns: 36px 1fr; }
.list {
  padding: 8px; display: flex; flex-direction: column; gap: 2px;
  align-self: start; position: sticky; top: 16px;
}
.list.collapsed { padding: 6px 4px; }
.list-head {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 10px 10px; border-bottom: 1px solid var(--sw-line); margin-bottom: 6px;
}
.list.collapsed .list-head {
  border-bottom: 1px solid var(--sw-line); padding: 4px 0 6px; justify-content: center;
}
.list-head h4 { margin: 0; font-size: 11.5px; font-weight: 600; color: var(--sw-fg-0); }
.list-head .sub { font-size: 10px; color: var(--sw-fg-3); margin-left: auto; }
.list-toggle {
  flex: 0 0 auto; width: 22px; height: 22px; margin-right: 4px;
  background: transparent; border: none; color: var(--sw-fg-3); cursor: pointer;
  font: inherit; border-radius: 3px; display: inline-grid; place-items: center;
}
.list-toggle:hover { background: var(--sw-bg-2); color: var(--sw-fg-1); }
.list-toggle .caret { display: inline-block; font-size: 13px; line-height: 1; transition: transform 0.15s; }
.list-toggle .caret.open { transform: rotate(90deg); }

.kicker-row {
  font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600;
  color: var(--sw-fg-3); padding: 8px 10px 4px;
}
.row {
  display: flex; align-items: center; gap: 8px;
  padding: 7px 10px; border-radius: 5px;
  background: transparent; border: none; color: var(--sw-fg-1);
  font-size: 12px; cursor: pointer; text-align: left; font: inherit;
}
.row:hover { background: var(--sw-bg-2); }
.row.active {
  background: var(--sw-bg-3); color: var(--sw-fg-0);
  box-shadow: inset 2px 0 0 var(--sw-accent);
}
.row .dot { width: 7px; height: 7px; border-radius: 50%; flex: 0 0 7px; }
.row .dot.pub { background: var(--sw-accent); }
.row .dot.op { background: var(--sw-warn); }
.row .name { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.row .count {
  font-family: var(--sw-mono); font-size: 10px; color: var(--sw-fg-3);
}
.row.active .count { color: var(--sw-fg-2); }
.collapsed-row { justify-content: center; padding: 6px 4px; }
.collapsed-row .dot { width: 10px; height: 10px; }

.detail { display: flex; flex-direction: column; gap: 14px; min-width: 0; }
.placeholder { padding: 28px; text-align: center; color: var(--sw-fg-3); font-size: 12px; }

.meta { padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
.meta-head { display: flex; align-items: flex-start; gap: 12px; }
.meta-head h3 { margin: 0 0 6px; font-size: 16px; color: var(--sw-fg-0); }
.meta-sub { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.meta-key { font-size: 10.5px; color: var(--sw-fg-3); }
.meta-key code {
  font-family: var(--sw-mono); color: var(--sw-fg-1);
  background: var(--sw-bg-2); padding: 1px 4px; border-radius: 3px;
}
.desc { margin: 0; font-size: 12px; color: var(--sw-fg-2); line-height: 1.5; }
.layers { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.layers-label {
  font-size: 10px; color: var(--sw-fg-3); text-transform: uppercase; letter-spacing: 0.08em;
}
.layer-chip {
  font-family: var(--sw-mono); font-size: 10.5px;
  padding: 2px 6px; border-radius: 3px;
  background: var(--sw-bg-2); border: 1px solid var(--sw-line);
  color: var(--sw-fg-1);
}

.widgets { padding: 14px 16px; }
.sec-head { display: flex; align-items: baseline; gap: 8px; margin-bottom: 10px; }
.sec-head h4 { margin: 0; font-size: 12.5px; font-weight: 600; color: var(--sw-fg-0); }
.sec-head .sub { font-size: 10.5px; color: var(--sw-fg-3); margin-left: auto; }
.loading { font-size: 11px; color: var(--sw-fg-3); }
.widget-list { display: flex; flex-direction: column; gap: 10px; }
.summary-row { display: flex; flex-wrap: wrap; gap: 6px; }
.type-chip {
  font-size: 10.5px; padding: 3px 8px; border-radius: 10px;
  background: var(--sw-bg-2); border: 1px solid var(--sw-line); color: var(--sw-fg-2);
}
.type-chip b { color: var(--sw-fg-0); margin-left: 4px; }
.widget-table {
  width: 100%; border-collapse: collapse; font-size: 11.5px;
}
.widget-table th, .widget-table td {
  text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--sw-line);
}
.widget-table th {
  font-weight: 600; font-size: 10.5px; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--sw-fg-3);
}
.widget-table td code {
  font-family: var(--sw-mono); font-size: 10.5px; color: var(--sw-fg-2);
}

.note { padding: 12px 16px; background: var(--sw-bg-1); }
.note p { margin: 0; font-size: 11.5px; color: var(--sw-fg-2); line-height: 1.5; }
.note code {
  font-family: var(--sw-mono); font-size: 10.5px;
  padding: 1px 4px; border-radius: 3px;
  background: var(--sw-bg-2); color: var(--sw-fg-1);
}

.sw-badge.ok { background: rgba(34, 197, 94, 0.12); color: var(--sw-ok); }
.sw-badge.warn { background: rgba(234, 179, 8, 0.12); color: var(--sw-warn); }
</style>
