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
  d3-flame-graph wrapper for trace profiling analyze results. Mirrors
  the booster-ui Content.vue drawing logic but extracted as a focused
  component the trace + eBPF + async + pprof views can all reuse.

  Inputs:
    trees: ProfileAnalyzationTree[]  — server-returned analyze trees
    metricKey: 'count' | 'duration'  — what value drives the box width
                                       (count for trace, duration for
                                       eBPF / async / pprof). Default
                                       is `count`.
-->
<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as d3 from 'd3';
import { flamegraph } from 'd3-flame-graph';
import type { ProfileAnalyzationElement, ProfileAnalyzationTree } from '@/api/client';

interface FlameNode {
  name: string;
  value: number;
  count: number;
  duration: number;
  durationChildExcluded: number;
  codeSignature: string;
  parentId: string;
  originId: string;
  children?: FlameNode[];
}

const props = withDefaults(
  defineProps<{
    trees: ProfileAnalyzationTree[];
    metricKey?: 'count' | 'duration';
  }>(),
  { metricKey: 'count' },
);

const root = ref<HTMLDivElement | null>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let chart: any = null;

function metricFor(el: ProfileAnalyzationElement): number {
  if (props.metricKey === 'duration') return Math.max(0, el.duration);
  return Math.max(0, el.count);
}

function buildVirtualRoot(): FlameNode | null {
  if (!props.trees.length) return null;
  const all: number[] = [];
  for (const t of props.trees) for (const el of t.elements) all.push(metricFor(el));
  const min = all.length ? Math.min(...all) : 0;
  const max = all.length ? Math.max(...all) : 1;
  const scale = d3.scaleLinear().domain([min, max]).range([1, 200]);

  function processTree(arr: ProfileAnalyzationElement[]): FlameNode | null {
    const items = arr.map<FlameNode>((el) => ({
      name: el.codeSignature,
      value: Number(scale(metricFor(el)).toFixed(4)),
      count: el.count,
      duration: el.duration,
      durationChildExcluded: el.durationChildExcluded,
      codeSignature: el.codeSignature,
      parentId: String(Number(el.parentId) + 1),
      originId: String(Number(el.id) + 1),
    }));
    const idx: Record<string, FlameNode> = {};
    for (const it of items) idx[it.originId] = it;
    let r: FlameNode | null = null;
    for (const it of items) {
      if (it.parentId === '1') r = it;
      const me = idx[it.originId];
      const parent = idx[me.parentId];
      if (parent) (parent.children ??= []).push(me);
    }
    return r;
  }

  const virtRoot: FlameNode = {
    name: 'Virtual Root',
    value: 0,
    count: 0,
    duration: 0,
    durationChildExcluded: 0,
    codeSignature: 'Virtual Root',
    parentId: '0',
    originId: '1',
    children: [],
  };
  for (const tree of props.trees) {
    const r = processTree(tree.elements);
    if (r) virtRoot.children?.push(r);
  }
  // Roll up so a parent never reports less than the sum of its children
  // — d3-flame-graph requires that to lay frames out correctly.
  function rollup(n: FlameNode): void {
    if (n.children?.length) {
      let s = 0;
      for (const c of n.children) {
        rollup(c);
        s += c.value;
      }
      if (n.value < s) n.value = s;
    }
  }
  for (const c of virtRoot.children ?? []) rollup(c);
  let total = 0;
  for (const c of virtRoot.children ?? []) total += c.value;
  virtRoot.value = total;
  return virtRoot;
}

function draw(): void {
  if (!root.value) return;
  if (chart) {
    try {
      chart.destroy();
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      /* no-op */
    }
    chart = null;
  }
  root.value.innerHTML = '';
  const tree = buildVirtualRoot();
  if (!tree) return;
  const width = Math.max(root.value.getBoundingClientRect().width, 600);
  chart = flamegraph()
    .width(width - 12)
    .cellHeight(18)
    .transitionDuration(450)
    .minFrameSize(1)
    .transitionEase(d3.easeCubic as never)
    .sort(true)
    .title('')
    .selfValue(false)
    .inverted(true)
    // Dim, frame-friendly palette. d3-flame-graph's default ramp is a
     // bright yellow→orange→red gradient that overwhelms a dark UI; the
     // mapper below produces deterministic, lower-saturation colors
     // keyed off the frame name so each stack cell stays distinguishable
     // but the overall card reads as part of the dark canvas instead of
     // glowing through it.
    .setColorMapper((d: { highlight: boolean; data?: { name?: string } }, _original: string) => {
      if (d.highlight) return '#6aff8f';
      const name = d.data?.name ?? '';
      let hash = 0;
      for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
      // 0–360° hue, fixed mid sat + dark lightness for dark-theme calm.
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 32%, 38%)`;
    });

  chart.tooltip(false);
  d3.select(root.value).datum(tree).call(chart);
  const svg = root.value.querySelector('svg');
  if (svg) {
    // Click a frame → open the popout dialog. This replaces the
    // earlier cursor-following tooltip, which clipped against the
    // viewport edge when the cell was near the bottom of the page.
    // The dialog renders inside Vue's template (see below) — viewport-
    // centered, with backdrop + ESC + outside-click to dismiss.
    svg.addEventListener('click', (event) => {
      const target = (event.target as Element).closest('g');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = target && (d3.select(target as Element).datum() as any);
      if (!data || !data.data) return;
      selectedFrame.value = data.data as FlameNode;
    });
  }
}

const selectedFrame = ref<FlameNode | null>(null);
const rootCountForPct = computed<number>(() => {
  const tree = buildVirtualRoot();
  return tree?.count ?? 0;
});
const selectedPctRoot = computed<string>(() => {
  const f = selectedFrame.value;
  const total = rootCountForPct.value;
  if (!f || total === 0) return '0';
  return ((f.count / total) * 100).toFixed(2);
});

function closeFrameDialog(): void { selectedFrame.value = null; }
function onKeyDown(ev: KeyboardEvent): void {
  if (ev.key === 'Escape' && selectedFrame.value) closeFrameDialog();
}

onMounted(() => {
  draw();
  window.addEventListener('keydown', onKeyDown);
});
watch(() => [props.trees, props.metricKey], () => {
  // Closing the dialog on data change keeps a stale frame from being
  // shown after Analyze re-runs against a different span / segment.
  selectedFrame.value = null;
  draw();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown);
  if (chart) {
    try {
      chart.destroy();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (_e) {
      /* no-op */
    }
    chart = null;
  }
});
</script>

<template>
  <div ref="root" class="fg-host"></div>
  <!-- Frame-detail popout. Replaces the cursor-following tooltip that
       used to clip at the viewport edge — now centered, with a
       backdrop, ESC + outside-click + close-button to dismiss.
       Backdrop swallows the click bubble (.self) so clicks inside the
       dialog don't close it. -->
  <Teleport to="body">
    <div
      v-if="selectedFrame"
      class="fg-pop-backdrop"
      @click.self="closeFrameDialog"
    >
      <div class="fg-pop sw-card" role="dialog" aria-label="Frame detail">
        <header class="fg-pop-head">
          <h4>Stack frame</h4>
          <button
            type="button"
            class="fg-pop-close"
            aria-label="Close"
            title="Close (Esc)"
            @click="closeFrameDialog"
          >×</button>
        </header>
        <div class="fg-pop-body">
          <div class="fg-pop-sig" :title="selectedFrame.codeSignature">
            {{ selectedFrame.codeSignature }}
          </div>
          <dl class="fg-pop-rows">
            <div class="fg-pop-row">
              <dt>Dump count</dt>
              <dd>{{ selectedFrame.count }}</dd>
            </div>
            <div class="fg-pop-row">
              <dt>Duration</dt>
              <dd>{{ selectedFrame.duration }} ns</dd>
            </div>
            <div class="fg-pop-row">
              <dt>Duration (excl. children)</dt>
              <dd>{{ selectedFrame.durationChildExcluded }} ns</dd>
            </div>
            <div class="fg-pop-row">
              <dt>% of root</dt>
              <dd>{{ selectedPctRoot }}%</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.fg-host {
  width: 100%;
  height: 100%;
  overflow: auto;
  cursor: pointer;
}
.fg-host :deep(svg) {
  width: 100%;
}
</style>

<style>
/* Modal backdrop + frame-detail card. Lives in <body> via <Teleport>
 * so it isn't clipped by any ancestor's overflow:hidden. Card width
 * caps at 560px and uses `overflow-wrap: anywhere` so even the
 * longest stack frame (`org.jboss.threads.EnhancedQueueExecutor$
 * ThreadBody.run:1556`) wraps inside the box instead of pushing past
 * its edge. */
.fg-pop-backdrop {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}
.fg-pop {
  width: min(560px, 100%);
  max-height: calc(100vh - 64px);
  display: flex;
  flex-direction: column;
  background: var(--sw-bg-1, #1b1d24);
  border: 1px solid var(--sw-line, #2a2d36);
  border-radius: 6px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}
.fg-pop-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--sw-line, #2a2d36);
  background: var(--sw-bg-2, #20232c);
}
.fg-pop-head h4 {
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--sw-fg-1, #d4d6de);
}
.fg-pop-close {
  margin-left: auto;
  background: transparent;
  border: none;
  color: var(--sw-fg-3, #6b6f7a);
  font-size: 18px;
  line-height: 1;
  cursor: pointer;
  padding: 0 6px;
  border-radius: 3px;
}
.fg-pop-close:hover {
  background: var(--sw-bg-3, #2a2d36);
  color: var(--sw-fg-0, #f5f7fb);
}
.fg-pop-body {
  padding: 12px 14px;
  overflow: auto;
  font-family: var(--sw-mono, monospace);
  font-size: 11.5px;
  color: var(--sw-fg-1, #d4d6de);
  line-height: 1.5;
}
.fg-pop-sig {
  color: var(--sw-fg-0, #f5f7fb);
  font-weight: 600;
  margin-bottom: 10px;
  padding-bottom: 8px;
  border-bottom: 1px dashed var(--sw-line, #2a2d36);
  overflow-wrap: anywhere;
  word-break: break-all;
}
.fg-pop-rows {
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.fg-pop-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}
.fg-pop-row dt {
  margin: 0;
  color: var(--sw-fg-3, #6b6f7a);
  flex: 0 0 auto;
}
.fg-pop-row dd {
  margin: 0;
  color: var(--sw-fg-0, #f5f7fb);
  font-variant-numeric: tabular-nums;
  text-align: right;
  overflow-wrap: anywhere;
}
</style>
