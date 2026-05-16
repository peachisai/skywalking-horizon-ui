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
  Admin view for the Alarms page setup. Operators pick which OAP
  layers' RPM traffic to draw as the background series on /alarms and
  set the MQE expression to fire per layer.

  Defaults seed agent (`GENERAL`) + mesh (`MESH`) with `service_cpm`.
  Layers absent on the OAP install render as `present: false` on the
  alarms page (dimmed line, no values) — listing them here is
  harmless.
-->
<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import {
  bff,
  type AlarmTrafficLayerConfig,
  type AlarmsConfig,
} from '@/api/client';

const KNOWN_LAYERS: ReadonlyArray<{ key: string; label: string; defaultMqe: string }> = [
  { key: 'GENERAL', label: 'Agent (GENERAL)', defaultMqe: 'service_cpm' },
  { key: 'MESH', label: 'Mesh (MESH)', defaultMqe: 'service_cpm' },
  { key: 'MESH_DP', label: 'Mesh data plane', defaultMqe: 'service_cpm' },
  { key: 'MESH_CP', label: 'Mesh control plane', defaultMqe: 'service_cpm' },
  { key: 'K8S_SERVICE', label: 'Kubernetes service', defaultMqe: 'service_cpm' },
  { key: 'BROWSER', label: 'Browser', defaultMqe: 'browser_app_pv' },
  { key: 'VIRTUAL_DATABASE', label: 'Virtual database', defaultMqe: 'database_access_cpm' },
  { key: 'VIRTUAL_CACHE', label: 'Virtual cache', defaultMqe: 'cache_access_cpm' },
  { key: 'VIRTUAL_MQ', label: 'Virtual MQ', defaultMqe: 'mq_service_consume_cpm' },
  { key: 'VIRTUAL_GENAI', label: 'Virtual GenAI', defaultMqe: 'gen_ai_provider_cpm' },
];

const q = useQuery({
  queryKey: ['alarms/config'],
  queryFn: (): Promise<AlarmsConfig> => bff.alarms.config(),
  staleTime: Infinity,
});

const draft = ref<AlarmTrafficLayerConfig[]>([]);

watch(
  () => q.data.value,
  (cfg) => {
    if (cfg) draft.value = cfg.trafficLayers.map((l) => ({ ...l }));
  },
  { immediate: true },
);

const flash = ref<string | null>(null);
const saving = ref(false);

function setFlash(msg: string): void {
  flash.value = msg;
  setTimeout(() => {
    if (flash.value === msg) flash.value = null;
  }, 4000);
}

const usedLayerKeys = computed<Set<string>>(() => new Set(draft.value.map((l) => l.layerKey)));
const addableLayers = computed(() =>
  KNOWN_LAYERS.filter((L) => !usedLayerKeys.value.has(L.key)),
);

function addLayer(layerKey: string): void {
  const def = KNOWN_LAYERS.find((L) => L.key === layerKey);
  draft.value.push({ layerKey, mqe: def?.defaultMqe ?? 'service_cpm', label: def?.label });
}

function addCustom(): void {
  draft.value.push({ layerKey: '', mqe: 'service_cpm' });
}

function removeRow(i: number): void {
  draft.value.splice(i, 1);
}

async function onSave(): Promise<void> {
  // Drop empty rows + duplicates (keep the first occurrence) so the
  // BFF never sees a half-typed entry.
  const seen = new Set<string>();
  const clean: AlarmTrafficLayerConfig[] = [];
  for (const row of draft.value) {
    const key = row.layerKey.trim();
    if (!key) continue;
    if (!row.mqe.trim()) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    clean.push({
      layerKey: key.toUpperCase(),
      mqe: row.mqe.trim(),
      label: row.label?.trim() || undefined,
    });
  }
  saving.value = true;
  try {
    const saved = await bff.alarms.saveConfig({ trafficLayers: clean });
    draft.value = saved.trafficLayers.map((l) => ({ ...l }));
    setFlash(`saved · ${saved.trafficLayers.length} layer${saved.trafficLayers.length === 1 ? '' : 's'}`);
  } catch (err) {
    setFlash(err instanceof Error ? `error: ${err.message}` : 'save failed');
  } finally {
    saving.value = false;
  }
}

function onReset(): void {
  if (q.data.value) draft.value = q.data.value.trafficLayers.map((l) => ({ ...l }));
}

const isDirty = computed<boolean>(() => {
  const saved = q.data.value?.trafficLayers ?? [];
  if (saved.length !== draft.value.length) return true;
  for (let i = 0; i < saved.length; i++) {
    if (saved[i].layerKey !== draft.value[i].layerKey) return true;
    if (saved[i].mqe !== draft.value[i].mqe) return true;
    if ((saved[i].label ?? '') !== (draft.value[i].label ?? '')) return true;
  }
  return false;
});
</script>

<template>
  <div class="aps">
    <header class="aps__head">
      <div>
        <div class="aps__kicker">Dashboard setup · Alert page</div>
        <h1>Alert page setup</h1>
        <p class="aps__lede">
          Pick which OAP layers' RPM traffic gets rendered as the background series on
          <RouterLink to="/alarms">Alarms</RouterLink>, and set the MQE expression to fire per
          layer. Layers that aren't active on the OAP install are skipped silently — listing them
          here is harmless. Up to 8 layers.
        </p>
      </div>
    </header>

    <div v-if="q.isPending.value" class="aps__empty">loading…</div>

    <table v-else class="aps__table">
      <thead>
        <tr>
          <th>Layer key</th>
          <th>Display label</th>
          <th>MQE expression</th>
          <th style="width: 60px"></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(row, i) in draft" :key="i">
          <td>
            <input
              v-model="row.layerKey"
              type="text"
              placeholder="GENERAL"
              class="aps__in"
            />
          </td>
          <td>
            <input
              v-model="row.label"
              type="text"
              placeholder="(auto)"
              class="aps__in"
            />
          </td>
          <td>
            <input
              v-model="row.mqe"
              type="text"
              placeholder="service_cpm"
              class="aps__in aps__in--mono"
            />
          </td>
          <td>
            <button type="button" class="aps__del" @click="removeRow(i)">remove</button>
          </td>
        </tr>
        <tr v-if="draft.length === 0">
          <td colspan="4" class="aps__empty-row">No layers configured. Add one below.</td>
        </tr>
      </tbody>
    </table>

    <div class="aps__add">
      <span class="aps__add-label">Add layer:</span>
      <button
        v-for="L in addableLayers"
        :key="L.key"
        type="button"
        class="aps__add-chip"
        :disabled="draft.length >= 8"
        @click="addLayer(L.key)"
      >+ {{ L.label }}</button>
      <button
        type="button"
        class="aps__add-chip aps__add-chip--custom"
        :disabled="draft.length >= 8"
        @click="addCustom"
      >+ custom…</button>
    </div>

    <div class="aps__actions">
      <span v-if="flash" class="aps__flash">{{ flash }}</span>
      <span v-else-if="isDirty" class="aps__dirty">unsaved changes</span>
      <span v-else class="aps__clean">saved</span>
      <button
        type="button"
        class="aps__btn"
        :disabled="!isDirty || saving"
        @click="onReset"
      >reset</button>
      <button
        type="button"
        class="aps__btn aps__btn--primary"
        :disabled="!isDirty || saving"
        @click="onSave"
      >{{ saving ? 'saving…' : 'save' }}</button>
    </div>
  </div>
</template>

<style scoped>
.aps {
  padding: 20px 20px 60px;
  max-width: 1100px;
  margin: 0 auto;
}
.aps__head {
  margin-bottom: 18px;
}
.aps__kicker {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--sw-accent);
  margin-bottom: 4px;
}
.aps h1 {
  font-size: 22px;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--sw-fg-0);
  margin: 0 0 8px;
}
.aps__lede {
  font-size: 12.5px;
  color: var(--sw-fg-1);
  line-height: 1.5;
  margin: 0;
  max-width: 760px;
}
.aps__lede a {
  color: var(--sw-accent);
  text-decoration: none;
}
.aps__lede a:hover {
  text-decoration: underline;
}
.aps__empty {
  padding: 24px;
  text-align: center;
  color: var(--sw-fg-3);
  font-size: 12px;
}
.aps__table {
  width: 100%;
  border-collapse: collapse;
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 14px;
}
.aps__table thead th {
  text-align: left;
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-3);
  padding: 8px 12px;
  border-bottom: 1px solid var(--sw-line);
  background: var(--sw-bg-2);
  font-weight: 600;
}
.aps__table tbody td {
  padding: 8px 12px;
  border-bottom: 1px solid var(--sw-line);
}
.aps__table tbody tr:last-child td {
  border-bottom: none;
}
.aps__empty-row {
  text-align: center;
  color: var(--sw-fg-3);
  font-size: 12px;
  padding: 24px !important;
}
.aps__in {
  width: 100%;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line);
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 12px;
  padding: 5px 8px;
  border-radius: 4px;
}
.aps__in--mono {
  font-family: var(--sw-mono);
}
.aps__del {
  background: transparent;
  border: 1px solid var(--sw-line-2);
  color: var(--sw-fg-2);
  font: inherit;
  font-size: 11px;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.aps__del:hover {
  border-color: rgba(239, 68, 68, 0.4);
  color: var(--sw-err);
}
.aps__add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  padding: 10px 0;
  margin-bottom: 16px;
}
.aps__add-label {
  font-size: 10.5px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--sw-fg-3);
  margin-right: 4px;
}
.aps__add-chip {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line);
  color: var(--sw-fg-1);
  font: inherit;
  font-size: 11.5px;
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
}
.aps__add-chip:not(:disabled):hover {
  background: var(--sw-bg-2);
  color: var(--sw-fg-0);
  border-color: var(--sw-line-2);
}
.aps__add-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.aps__add-chip--custom {
  font-family: var(--sw-mono);
}
.aps__actions {
  display: flex;
  align-items: center;
  gap: 10px;
}
.aps__flash {
  font-size: 11px;
  color: var(--sw-ok);
  margin-right: auto;
}
.aps__dirty {
  font-size: 11px;
  color: var(--sw-warn);
  margin-right: auto;
}
.aps__clean {
  font-size: 11px;
  color: var(--sw-fg-3);
  margin-right: auto;
}
.aps__btn {
  background: var(--sw-bg-1);
  border: 1px solid var(--sw-line-2);
  color: var(--sw-fg-0);
  font: inherit;
  font-size: 12px;
  padding: 6px 14px;
  border-radius: 4px;
  cursor: pointer;
}
.aps__btn:not(:disabled):hover {
  background: var(--sw-bg-2);
}
.aps__btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.aps__btn--primary {
  background: var(--sw-accent);
  border-color: var(--sw-accent);
  color: #0a0d12;
  font-weight: 600;
}
.aps__btn--primary:not(:disabled):hover {
  background: var(--sw-accent-light, #fb923c);
}
</style>
