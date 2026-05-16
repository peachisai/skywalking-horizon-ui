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
  Per-layer Network Profiling tab — feature parity with booster-ui
  `dashboard/related/network-profiling`. Mounts on a service instance
  and surfaces eBPF NETWORK + CONTINUOUS_PROFILING tasks plus the
  process-level topology snapshot.

    ┌──────────────┬─────────────────────────────────────────────┐
    │  Instance    │ Topology window selector  · Keep-alive btn  │
    │  picker      ├─────────────────────────────────────────────┤
    │  Tasks list  │                                             │
    │  + New Task  │   ProcessTopologyGraph (d3 force layout)    │
    │              │                                             │
    │              ├─────────────────────────────────────────────┤
    │              │  Selected node / call detail panel          │
    └──────────────┴─────────────────────────────────────────────┘
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useLayerInstances } from '@/composables/useLayerInstances';
import { useSelectedService } from '@/composables/useSelectedService';
import { bffClient } from '@/api/client';
import type {
  EBPFTask,
  NetworkProfilingSampling,
  ProcessCall,
  ProcessNode,
} from '@/api/client';
import ProcessTopologyGraph from '@/components/profile/ProcessTopologyGraph.vue';

const route = useRoute();
const layerKey = computed(() => String(route.params.layerKey ?? ''));
const { selectedId: serviceId } = useSelectedService();

// Instance picker (binds to ?serviceInstance= via plain ref state — the
// network view needs an *instance* to be useful, so we don't reuse the
// generic `useSelectedInstance` composable's URL contract).
const instances = useLayerInstances(layerKey, serviceId);
const selectedInstanceId = ref<string | null>(null);
watch(
  () => instances.instances.value,
  (rows) => {
    if (rows.length && !rows.some((i) => i.id === selectedInstanceId.value)) {
      selectedInstanceId.value = rows[0]?.id ?? null;
    }
  },
  { immediate: true },
);

// ── Tasks ──────────────────────────────────────────────────────────
const tasks = ref<EBPFTask[]>([]);
const tasksError = ref<string | null>(null);
const tasksLoading = ref(false);
const currentTask = ref<EBPFTask | null>(null);
const aliveStatus = ref<boolean | null>(null);

watch(
  () => layerKey.value + '|' + (serviceId.value ?? '') + '|' + (selectedInstanceId.value ?? ''),
  () => void refreshTasks(),
  { immediate: true },
);

async function refreshTasks(): Promise<void> {
  tasksError.value = null;
  tasks.value = [];
  currentTask.value = null;
  if (!serviceId.value && !selectedInstanceId.value) return;
  tasksLoading.value = true;
  try {
    const resp = await bffClient.layerNetworkTasks(layerKey.value, {
      service: serviceId.value ?? undefined,
      serviceInstance: selectedInstanceId.value ?? undefined,
    });
    if (!resp.reachable && resp.error) tasksError.value = resp.error;
    tasks.value = resp.tasks ?? [];
    currentTask.value = tasks.value[0] ?? null;
    await loadTopology();
  } catch (e) {
    tasksError.value = e instanceof Error ? e.message : String(e);
  } finally {
    tasksLoading.value = false;
  }
}

// ── Process topology ──────────────────────────────────────────────
const nodes = ref<ProcessNode[]>([]);
const calls = ref<ProcessCall[]>([]);
const topologyLoading = ref(false);
const topologyError = ref<string | null>(null);
const windowMinutes = ref(30);

async function loadTopology(): Promise<void> {
  nodes.value = [];
  calls.value = [];
  topologyError.value = null;
  if (!selectedInstanceId.value) return;
  topologyLoading.value = true;
  try {
    const resp = await bffClient.ebpfNetworkTopology(
      selectedInstanceId.value,
      windowMinutes.value,
    );
    if (!resp.reachable && resp.error) topologyError.value = resp.error;
    nodes.value = resp.nodes ?? [];
    calls.value = resp.calls ?? [];
  } catch (e) {
    topologyError.value = e instanceof Error ? e.message : String(e);
  } finally {
    topologyLoading.value = false;
  }
}

const selectedNode = ref<ProcessNode | null>(null);
const selectedCall = ref<ProcessCall | null>(null);

async function keepAlive(): Promise<void> {
  if (!currentTask.value) return;
  aliveStatus.value = null;
  try {
    const resp = await bffClient.keepAliveNetworkProfilingTask(currentTask.value.taskId);
    aliveStatus.value = resp.status;
  } catch {
    aliveStatus.value = false;
  }
}

// ── New task modal ────────────────────────────────────────────────
const showNewTask = ref(false);
const newTaskError = ref<string | null>(null);
const samplings = ref<NetworkProfilingSampling[]>([
  { uriRegex: '', minDuration: 0, when4xx: true, when5xx: true, settings: { requireRequest: true, requireResponse: true } },
]);
function addSampling(): void {
  samplings.value.push({ minDuration: 0, when4xx: false, when5xx: false });
}
function removeSampling(i: number): void {
  samplings.value.splice(i, 1);
}
async function submitNewTask(): Promise<void> {
  if (!selectedInstanceId.value) {
    newTaskError.value = 'Pick an instance first';
    return;
  }
  newTaskError.value = null;
  try {
    const resp = await bffClient.createNetworkProfilingTask({
      instanceId: selectedInstanceId.value,
      samplings: samplings.value,
    });
    if (!resp.status && resp.errorReason) {
      newTaskError.value = resp.errorReason;
      return;
    }
    if (!resp.reachable && resp.error) {
      newTaskError.value = resp.error;
      return;
    }
    showNewTask.value = false;
    await refreshTasks();
  } catch (e) {
    newTaskError.value = e instanceof Error ? e.message : String(e);
  }
}

function fmtTime(ms: number): string {
  if (!ms) return '—';
  const d = new Date(ms);
  const z = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())} ${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
}
</script>

<template>
  <div class="sw-card net-shell">
    <!-- Side: instance picker + tasks -->
    <div class="net-side">
      <div class="side-head">
        <span>Instance</span>
      </div>
      <div class="picker">
        <select v-model="selectedInstanceId" class="sel wide" :disabled="!instances.instances.value.length">
          <option v-if="!instances.instances.value.length" :value="null">— no instances —</option>
          <option v-for="inst in instances.instances.value" :key="inst.id" :value="inst.id">
            {{ inst.name }}
          </option>
        </select>
      </div>

      <div class="side-head between">
        <span>Network tasks</span>
        <button
          class="btn-new"
          :disabled="!selectedInstanceId"
          @click="showNewTask = true"
        >+ New Task</button>
      </div>
      <div v-if="tasksError" class="side-err">{{ tasksError }}</div>
      <div v-else-if="tasksLoading && !tasks.length" class="side-empty">Loading…</div>
      <div v-else-if="!tasks.length" class="side-empty">
        {{ selectedInstanceId ? 'No network tasks on this instance.' : 'Pick an instance to load tasks.' }}
      </div>
      <ul v-else class="side-list">
        <li
          v-for="t in tasks"
          :key="t.taskId"
          :class="{ 'is-active': currentTask?.taskId === t.taskId }"
          @click="currentTask = t"
        >
          <div class="row1">
            <span class="t-tag net">NETWORK</span>
            <span class="ep">{{ t.serviceInstanceName || t.taskId.slice(0, 12) }}</span>
          </div>
          <div class="row2">
            <span>{{ fmtTime(t.taskStartTime) }}</span>
          </div>
        </li>
      </ul>
    </div>

    <!-- Main: topology + detail -->
    <div class="net-main">
      <div class="filter-bar">
        <div class="tb-block">
          <label class="lbl">Window</label>
          <select v-model.number="windowMinutes" class="sel" @change="loadTopology">
            <option :value="5">5 min</option>
            <option :value="15">15 min</option>
            <option :value="30">30 min</option>
            <option :value="60">1 hr</option>
            <option :value="180">3 hr</option>
          </select>
        </div>
        <button
          class="btn-secondary"
          :disabled="!currentTask"
          @click="keepAlive"
        >Keep-alive ping</button>
        <span v-if="aliveStatus !== null" :class="['alive', aliveStatus ? 'ok' : 'err']">
          {{ aliveStatus ? 'Sent ✓' : 'OAP rejected' }}
        </span>
        <span class="spacer"></span>
        <span class="muted" v-if="!topologyLoading">{{ nodes.length }} processes · {{ calls.length }} edges</span>
        <span v-if="topologyLoading" class="muted">loading topology…</span>
      </div>

      <div v-if="topologyError" class="banner err">{{ topologyError }}</div>

      <div class="topology">
        <ProcessTopologyGraph
          v-if="nodes.length"
          :nodes="nodes"
          :calls="calls"
          @select-node="selectedNode = $event; selectedCall = null"
          @select-call="selectedCall = $event; selectedNode = null"
        />
        <div v-else-if="!topologyLoading" class="topology-empty">
          {{ selectedInstanceId
            ? 'No process topology data in the selected window. Create a network profile task and let it run, then refresh.'
            : 'Pick an instance to view its process topology.' }}
        </div>
      </div>

      <div v-if="selectedNode || selectedCall" class="detail">
        <div v-if="selectedNode">
          <h5>Process</h5>
          <dl class="kv">
            <dt>Name</dt><dd>{{ selectedNode.name }}</dd>
            <dt>Real?</dt><dd>{{ selectedNode.isReal ? 'yes' : 'virtual peer' }}</dd>
            <dt>Service</dt><dd>{{ selectedNode.serviceName }}</dd>
            <dt>Instance</dt><dd>{{ selectedNode.serviceInstanceName }}</dd>
            <dt>ID</dt><dd class="mono">{{ selectedNode.id }}</dd>
          </dl>
        </div>
        <div v-else-if="selectedCall">
          <h5>Edge</h5>
          <dl class="kv">
            <dt>Detect points</dt><dd>{{ selectedCall.detectPoints.join(', ') }}</dd>
            <dt>Source comp.</dt><dd>{{ (selectedCall.sourceComponents ?? []).join(', ') || '—' }}</dd>
            <dt>Target comp.</dt><dd>{{ (selectedCall.targetComponents ?? []).join(', ') || '—' }}</dd>
            <dt>ID</dt><dd class="mono">{{ selectedCall.id }}</dd>
          </dl>
        </div>
      </div>
    </div>
  </div>

  <div v-if="showNewTask" class="dlg-mask" @click.self="showNewTask = false">
    <div class="dlg wide">
      <div class="dlg-head">
        <div>New network profile task</div>
        <button class="x" @click="showNewTask = false">×</button>
      </div>
      <div class="dlg-body">
        <p class="hint">
          OAP captures one connection sample per matching rule. Leave URI
          empty to match any request; toggle 4xx/5xx to scope by status.
        </p>
        <div v-for="(s, i) in samplings" :key="i" class="sampling">
          <div class="sampling-head">
            <strong>Sampling rule {{ i + 1 }}</strong>
            <button
              v-if="samplings.length > 1"
              class="del"
              type="button"
              @click="removeSampling(i)"
            >× remove</button>
          </div>
          <div class="field-row">
            <div class="field grow">
              <label>URI regex (optional)</label>
              <input class="ti-input wide" v-model="s.uriRegex" placeholder="e.g. ^/api/.*" />
            </div>
            <div class="field">
              <label>Min duration (ms)</label>
              <input class="ti-input" type="number" min="0" v-model.number="s.minDuration" />
            </div>
          </div>
          <div class="check-row">
            <label class="cb"><input type="checkbox" v-model="s.when4xx" /> when 4xx</label>
            <label class="cb"><input type="checkbox" v-model="s.when5xx" /> when 5xx</label>
            <label class="cb"><input type="checkbox" v-model="s.settings!.requireRequest" /> capture request</label>
            <label class="cb"><input type="checkbox" v-model="s.settings!.requireResponse" /> capture response</label>
          </div>
        </div>
        <button class="btn-secondary" type="button" @click="addSampling">+ add another sampling rule</button>
        <div v-if="newTaskError" class="dlg-err">{{ newTaskError }}</div>
      </div>
      <div class="dlg-foot">
        <button class="btn-secondary" @click="showNewTask = false">Cancel</button>
        <button class="btn-primary" @click="submitNewTask">Create task</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.net-shell {
  display: flex;
  height: calc(100vh - 280px);
  min-height: 520px;
  padding: 0;
  overflow: hidden;
}
.net-side {
  width: 310px;
  flex: 0 0 310px;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--sw-line);
}
.side-head {
  padding: 6px 10px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--sw-fg-1);
  background: var(--sw-bg-2);
  border-bottom: 1px solid var(--sw-line);
}
.side-head.between {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 0;
}
.picker {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sw-line);
}
.btn-new {
  font-size: 10.5px;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid var(--sw-line-2);
  background: var(--sw-bg-1);
  color: var(--sw-fg-1);
  cursor: pointer;
}
.btn-new:hover:not(:disabled) {
  border-color: var(--sw-accent);
  color: var(--sw-accent);
}
.btn-new:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.side-err,
.side-empty {
  padding: 12px;
  font-size: 11.5px;
  color: var(--sw-fg-3);
  text-align: center;
}
.side-err {
  color: var(--sw-err);
}
.side-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  flex: 1 1 0;
}
.side-list li {
  padding: 8px 10px;
  border-bottom: 1px solid var(--sw-line);
  cursor: pointer;
}
.side-list li:hover {
  background: var(--sw-bg-2);
}
.side-list li.is-active {
  background: var(--sw-bg-3, var(--sw-bg-2));
  border-left: 3px solid var(--sw-accent);
  padding-left: 7px;
}
.row1,
.row2 {
  display: flex;
  align-items: center;
  gap: 6px;
}
.row2 {
  margin-top: 4px;
  font-size: 10.5px;
  color: var(--sw-fg-2);
}
.t-tag {
  display: inline-block;
  font-size: 10px;
  padding: 0 5px;
  border-radius: 2px;
  background: var(--sw-accent);
  color: #fff;
  font-weight: 600;
}
.t-tag.net {
  background: #58a6ff;
}
.ep {
  font-size: 12px;
  color: var(--sw-fg-0);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.muted {
  color: var(--sw-fg-3);
}

.net-main {
  flex: 1 1 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.filter-bar {
  display: flex;
  align-items: end;
  gap: 12px;
  padding: 8px 12px;
  background: var(--sw-bg-1);
  border-bottom: 1px solid var(--sw-line);
}
.tb-block {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.lbl {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sw-fg-3);
}
.sel,
.ti-input {
  background: var(--sw-bg-2);
  color: var(--sw-fg-0);
  border: 1px solid var(--sw-line);
  border-radius: 3px;
  padding: 4px 6px;
  font-size: 11.5px;
  font-family: var(--sw-mono);
  outline: none;
}
.sel.wide,
.ti-input.wide {
  width: 100%;
}
.btn-primary {
  background: var(--sw-accent);
  color: #fff;
  border: none;
  border-radius: 3px;
  padding: 6px 14px;
  font-size: 11.5px;
  font-weight: 600;
  cursor: pointer;
}
.btn-secondary {
  background: var(--sw-bg-2);
  color: var(--sw-fg-1);
  border: 1px solid var(--sw-line-2);
  border-radius: 3px;
  padding: 5px 12px;
  font-size: 11.5px;
  cursor: pointer;
}
.btn-secondary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.alive {
  font-size: 10.5px;
  padding: 0 6px;
  border-radius: 2px;
}
.alive.ok {
  color: var(--sw-accent);
}
.alive.err {
  color: var(--sw-err);
}
.spacer {
  flex: 1 1 0;
}
.banner.err {
  padding: 6px 12px;
  font-size: 11px;
  color: var(--sw-err);
  background: var(--sw-bg-2);
  border-bottom: 1px solid var(--sw-line);
}
.topology {
  flex: 1 1 0;
  position: relative;
  min-height: 240px;
}
.topology-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11.5px;
  color: var(--sw-fg-3);
  padding: 20px;
  text-align: center;
}
.detail {
  border-top: 1px solid var(--sw-line);
  background: var(--sw-bg-1);
  padding: 8px 14px;
  max-height: 220px;
  overflow-y: auto;
}
.detail h5 {
  margin: 0 0 6px;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sw-fg-1);
}
.kv {
  display: grid;
  grid-template-columns: 130px 1fr;
  row-gap: 4px;
  font-size: 11.5px;
  margin: 0;
}
.kv dt {
  color: var(--sw-fg-3);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  align-self: center;
}
.kv dd {
  margin: 0;
  color: var(--sw-fg-0);
}
.kv dd.mono {
  font-family: var(--sw-mono);
  font-size: 10.5px;
  color: var(--sw-fg-1);
}

.dlg-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 50;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dlg {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 6px;
  width: 560px;
  max-width: 92vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.dlg.wide {
  width: 640px;
}
.dlg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sw-line);
  background: var(--sw-bg-2);
  font-weight: 600;
  font-size: 12.5px;
  color: var(--sw-fg-0);
}
.x {
  background: transparent;
  border: none;
  color: var(--sw-fg-3);
  font-size: 18px;
  cursor: pointer;
}
.dlg-body {
  padding: 14px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.hint {
  font-size: 11px;
  color: var(--sw-fg-2);
  margin: 0;
  line-height: 1.5;
}
.sampling {
  border: 1px solid var(--sw-line);
  border-radius: 4px;
  padding: 10px;
  background: var(--sw-bg-2);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.sampling-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  color: var(--sw-fg-1);
}
.sampling-head .del {
  background: transparent;
  border: none;
  color: var(--sw-err);
  cursor: pointer;
  font-size: 11px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.field.grow {
  flex: 1 1 0;
}
.field label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--sw-fg-3);
}
.field-row {
  display: flex;
  gap: 8px;
  align-items: end;
}
.check-row {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11.5px;
  color: var(--sw-fg-1);
}
.cb {
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.dlg-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 14px;
  border-top: 1px solid var(--sw-line);
}
.dlg-err {
  color: var(--sw-err);
  font-size: 11px;
}
</style>
