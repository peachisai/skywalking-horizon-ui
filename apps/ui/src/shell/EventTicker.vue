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
  Single-line event ticker that lives in the left half of the topbar.
  Shows the latest framework event ("Loading services…", "✓ services
  ready · 84ms") so the operator can see what the SPA is actually
  doing while a page assembles. Click the ▾ caret to expand the full
  history of the current page's events; resets on every route change
  via the eventLog store.
-->
<script setup lang="ts">
import { computed, ref } from 'vue';
import { useEventLog } from '@/controls/eventLog';

const { latest, all } = useEventLog();
const open = ref(false);
function toggle(): void {
  open.value = !open.value;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
function kindGlyph(k: 'start' | 'ok' | 'err' | 'info'): string {
  return k === 'ok' ? '✓' : k === 'err' ? '✕' : k === 'start' ? '…' : '·';
}

const latestText = computed<string>(() => {
  const e = latest.value;
  if (!e) return 'idle';
  const dur = e.durationMs != null ? ` · ${e.durationMs}ms` : '';
  return `${kindGlyph(e.kind)} ${e.text}${dur}`;
});
const latestKind = computed<string>(() => latest.value?.kind ?? 'info');
const eventCount = computed<number>(() => all.value.length);
</script>

<template>
  <div class="ev-zone" :class="['ev-kind-' + latestKind, { open }]">
    <button class="ev-line" type="button" @click="toggle" :aria-expanded="open">
      <span class="ev-text">{{ latestText }}</span>
      <span class="ev-count" v-if="eventCount > 0">({{ eventCount }})</span>
      <span class="ev-caret" :class="{ open }">▾</span>
    </button>
    <div v-if="open" class="ev-popover">
      <div v-if="all.length === 0" class="ev-empty">no events yet</div>
      <ol v-else class="ev-list">
        <li
          v-for="e in [...all].reverse()"
          :key="e.id"
          :class="'ev-row ev-kind-' + e.kind"
        >
          <span class="ev-row-time">{{ fmtTime(e.ts) }}</span>
          <span class="ev-row-glyph">{{ kindGlyph(e.kind) }}</span>
          <span class="ev-row-topic">{{ e.topic }}</span>
          <span class="ev-row-text">{{ e.text }}</span>
          <span v-if="e.durationMs != null" class="ev-row-dur">{{ e.durationMs }}ms</span>
        </li>
      </ol>
    </div>
  </div>
</template>

<style scoped>
.ev-zone {
  position: relative;
  flex: 1;
  min-width: 0;
  font-variant-numeric: tabular-nums;
}
.ev-line {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 28px;
  padding: 0 10px;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line);
  border-radius: 4px;
  color: var(--sw-fg-1);
  font: inherit;
  font-size: 11.5px;
  cursor: pointer;
  text-align: left;
  overflow: hidden;
}
.ev-line:hover {
  border-color: var(--sw-line-2);
  background: var(--sw-bg-1);
}
.ev-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--sw-mono);
}
.ev-count {
  color: var(--sw-fg-3);
  font-size: 10.5px;
}
.ev-caret {
  color: var(--sw-fg-3);
  font-size: 10px;
  transition: transform 0.12s;
}
.ev-caret.open {
  transform: rotate(180deg);
}
/* Kind tint applies to the latest line so the operator can read state
 * at a glance — error red, success green-ish, in-flight neutral. */
.ev-kind-start .ev-text { color: var(--sw-accent-2); }
.ev-kind-ok    .ev-text { color: var(--sw-ok); }
.ev-kind-err   .ev-text { color: var(--sw-err); }
.ev-kind-info  .ev-text { color: var(--sw-fg-2); }

.ev-popover {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  /* ~10 rows visible at once; the rest scrolls. Row is ~24px
   * (4px top + 4px bottom padding + 11px text + a touch of slack). */
  max-height: 260px;
  overflow-y: auto;
  z-index: 50;
  background: var(--sw-bg-2);
  border: 1px solid var(--sw-line-2);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
}
.ev-empty {
  padding: 12px;
  font-size: 11px;
  color: var(--sw-fg-3);
  text-align: center;
}
.ev-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}
.ev-row {
  display: grid;
  grid-template-columns: auto auto auto 1fr auto;
  align-items: baseline;
  gap: 8px;
  padding: 4px 10px;
  font-size: 11px;
  font-family: var(--sw-mono);
  color: var(--sw-fg-1);
  border-bottom: 1px solid var(--sw-line);
}
.ev-row:last-child { border-bottom: none; }
.ev-row-time { color: var(--sw-fg-3); font-size: 10px; }
.ev-row-glyph { color: var(--sw-fg-2); width: 12px; text-align: center; }
.ev-row-topic { color: var(--sw-fg-3); font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; }
.ev-row-text { color: var(--sw-fg-1); overflow: hidden; text-overflow: ellipsis; }
.ev-row-dur { color: var(--sw-fg-3); font-size: 10px; }
.ev-row.ev-kind-ok  .ev-row-glyph { color: var(--sw-ok); }
.ev-row.ev-kind-err .ev-row-glyph { color: var(--sw-err); }
.ev-row.ev-kind-err .ev-row-text  { color: var(--sw-err); }
.ev-row.ev-kind-start .ev-row-glyph { color: var(--sw-accent-2); }
</style>
