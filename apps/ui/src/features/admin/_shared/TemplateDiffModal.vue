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
  Per-template "show diff & reset" modal. Opens from any diverged row
  in the admin lists. Two stacked surfaces:

    1. Monaco side-by-side diff — bundled (left, original) vs remote
       (right, modified). JSON syntax. Read-only.
    2. Reset-to-bundled affordance with destructive confirmation —
       the operator must type the template KEY (e.g. `GENERAL`,
       `services`, `page-setup`) to arm the Reset button. Reset POSTs
       the bundled JSON to OAP, overwriting whatever the operator (or
       another UI) wrote there.

  Reset is the inverse of Save: Save sends draft to OAP; Reset sends
  bundled to OAP. There is no "adopt remote into bundled" — bundled is
  a code-shape decision, edited by committing JSON in the repo.
-->
<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { bff } from '@/api/client';
import type { TemplateSyncRow } from '@/api/scopes/template-sync';
import Modal from '@/features/operate/_shared/Modal.vue';
import MonacoDiff from '@/features/operate/_shared/MonacoDiff.vue';
import Btn from '@/components/primitives/Btn.vue';

const props = defineProps<{
  /** Full OAP UI-template name, e.g. `horizon.layer.GENERAL`. */
  name: string;
  /** Short key the operator types to confirm. Just the trailing
   *  segment, e.g. `GENERAL`, `services`, `page-setup`. */
  confirmKey: string;
  open: boolean;
}>();

const emit = defineEmits<{ close: []; reset: [] }>();

const row = ref<TemplateSyncRow | null>(null);
const loading = ref(false);
const loadError = ref<string | null>(null);
const typed = ref('');
const resetBusy = ref(false);
const resetError = ref<string | null>(null);
const armed = computed<boolean>(() => typed.value.trim() === props.confirmKey);

// Pretty-printed JSON for the diff editor — the wire form is canonical
// (sorted keys, no whitespace), readable for compare but unreadable
// for a human. JSON.parse + JSON.stringify(_, null, 2) gives us
// 2-space pretty without changing the data.
const bundledPretty = computed<string>(() => prettyJson(row.value?.bundled?.configuration ?? ''));
const remotePretty = computed<string>(() => prettyJson(row.value?.remote?.configuration ?? ''));

function prettyJson(raw: string): string {
  if (!raw) return '';
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadError.value = null;
  try {
    const status = await bff.templateSync.syncStatus();
    const found = status.rows.find((r) => r.name === props.name) ?? null;
    if (!found) {
      loadError.value = `No template named ${props.name} in OAP sync status.`;
    }
    row.value = found;
  } catch (err) {
    loadError.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
}

// Re-fetch on every open, and reset the confirm input. Stale data
// between opens would mislead operators about what they're about to
// overwrite.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) {
      typed.value = '';
      resetError.value = null;
      return;
    }
    void load();
  },
);

onMounted(() => {
  if (props.open) void load();
});

async function onReset(): Promise<void> {
  if (!armed.value || resetBusy.value) return;
  resetBusy.value = true;
  resetError.value = null;
  try {
    await bff.templateSync.pushBundled(props.name);
    emit('reset');
    emit('close');
  } catch (err) {
    resetError.value = err instanceof Error ? err.message : String(err);
  } finally {
    resetBusy.value = false;
  }
}
</script>

<template>
  <Modal :open="open" :title="`Template diff — ${name}`" @close="emit('close')">
    <div v-if="loading" class="tdm__loading">Loading sync status…</div>
    <div v-else-if="loadError" class="tdm__err">{{ loadError }}</div>
    <template v-else-if="row">
      <div class="tdm__legend">
        <span class="tdm__legend-l">Left: <strong>bundled</strong> (the BFF's seed JSON)</span>
        <span class="tdm__legend-r">Right: <strong>OAP-stored</strong> (operator-edited)</span>
      </div>
      <div class="tdm__diff">
        <MonacoDiff :original="bundledPretty" :modified="remotePretty" language="json" />
      </div>

      <div class="tdm__reset">
        <h4>Reset to bundled</h4>
        <p class="tdm__reset-lede">
          This overwrites <code>{{ name }}</code> on OAP with the bundled JSON shown on the
          left. The operator's edits on OAP are <strong>lost</strong>. The bundle is
          considered the source of truth after this action.
        </p>
        <label class="tdm__reset-label">
          Type <code>{{ confirmKey }}</code> to arm the Reset button:
          <input
            v-model="typed"
            type="text"
            autocomplete="off"
            spellcheck="false"
            class="tdm__reset-input"
          />
        </label>
        <div v-if="resetError" class="tdm__err">{{ resetError }}</div>
      </div>
    </template>

    <template #footer>
      <Btn @click="emit('close')">close</Btn>
      <Btn
        v-if="row"
        kind="danger"
        :disabled="!armed || resetBusy"
        @click="onReset"
      >
        {{ resetBusy ? 'resetting…' : 'reset OAP to bundled' }}
      </Btn>
    </template>
  </Modal>
</template>

<style scoped>
.tdm__loading,
.tdm__err {
  padding: 16px;
  font-size: 13px;
  color: var(--rr-ink2);
}
.tdm__err {
  color: var(--rr-danger, #c0392b);
}
.tdm__legend {
  display: flex;
  justify-content: space-between;
  padding: 6px 8px;
  font-size: 11px;
  color: var(--rr-ink2);
  border-bottom: 1px solid var(--rr-border, #2a2f38);
}
.tdm__legend-l { color: var(--sw-text-muted, #8a93a0); }
.tdm__legend-r { color: var(--sw-warn, #b88500); }
.tdm__diff {
  height: 50vh;
  min-height: 400px;
  border-bottom: 1px solid var(--rr-border, #2a2f38);
}
.tdm__reset {
  padding: 14px 6px 4px;
}
.tdm__reset h4 {
  margin: 0 0 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-danger, #c0392b);
}
.tdm__reset-lede {
  margin: 0 0 12px;
  font-size: 12px;
  line-height: 1.55;
  color: var(--rr-ink2);
}
.tdm__reset-label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12px;
  color: var(--rr-ink2);
}
.tdm__reset-input {
  font-family: var(--rr-font-mono, ui-monospace, monospace);
  padding: 4px 6px;
}
</style>
