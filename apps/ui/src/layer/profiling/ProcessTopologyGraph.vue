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
  Process-level topology for network profiling.

  - Inside-pod processes (`isReal` / synthetic `UNKNOWN_LOCAL`) and
    external peers are each rendered as a flat-top hexagon CELL. Inside
    cells pack a honeycomb around the centre; external peers ring it.
  - A dashed hexagon boundary wraps the inside processes as tightly as
    possible (auto-fit to the inside cells) and is recomputed live while
    a node is dragged.
  - Edges are directed, animated (dashes flow source→target to show
    traffic direction) and clickable.
  - Clicking a node shows a floating info popover; clicking an edge
    emits `select-call` so the parent opens the metric dashboard.

  Emits:
    select-call — full ProcessCall (or null)
-->
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import * as d3 from 'd3';
import type { ProcessCall, ProcessNode } from '@/api/client';

interface Pt { x: number; y: number }
type PositionedNode = ProcessNode & Pt;
interface PositionedCall {
  id: string;
  source: PositionedNode;
  target: PositionedNode;
  protocol: string;
  lowerArc: boolean;
}

const props = defineProps<{ nodes: ProcessNode[]; calls: ProcessCall[] }>();
const emit = defineEmits<{ (e: 'select-call', c: ProcessCall | null): void }>();

const host = ref<HTMLDivElement | null>(null);
const selectedCallId = ref<string | null>(null);

// ── Hex geometry (flat-top) ─────────────────────────────────────────
const SQRT3 = Math.sqrt(3);
/** Flat-top axial → pixel. Neighbour centres land √3·r apart, so a cell
 *  hexagon of radius r tiles (touches) its neighbours — a honeycomb. */
function axialToPixel(ax: number, ay: number, r: number, o: Pt): Pt {
  return { x: 1.5 * ax * r + o.x, y: ((SQRT3 / 2) * ax + SQRT3 * ay) * r + o.y };
}
/** Axial coords in spiral order from the centre — packs a compact
 *  honeycomb cluster (centre cell, then rings around it). */
function spiralHex(n: number): Array<{ x: number; y: number }> {
  const dirs = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
  const out = [{ x: 0, y: 0 }];
  let k = 1;
  while (out.length < n) {
    let cx = dirs[4][0] * k;
    let cy = dirs[4][1] * k;
    for (let side = 0; side < 6 && out.length < n + 6; side++) {
      for (let step = 0; step < k; step++) {
        out.push({ x: cx, y: cy });
        cx += dirs[side][0];
        cy += dirs[side][1];
      }
    }
    k++;
  }
  return out.slice(0, n);
}
function hexCellPath(cx: number, cy: number, R: number): string {
  const v: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * 2 * (i / 6);
    v.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  return d3.line().curve(d3.curveLinearClosed)(v) ?? '';
}

function isInside(n: ProcessNode): boolean {
  return n.isReal || n.name === 'UNKNOWN_LOCAL';
}
function protocolOf(c: ProcessCall): string {
  const t = [...(c.sourceComponents ?? []), ...(c.targetComponents ?? [])].map((x) => x.toLowerCase());
  if (t.includes('https')) return 'HTTPS';
  if (t.includes('tls')) return 'TLS';
  if (t.includes('http')) return 'HTTP';
  return 'TCP';
}

let cellRadius = 26;
let positioned: PositionedNode[] = [];

function layout(o: Pt, w: number, h: number): PositionedNode[] {
  const inside = props.nodes.filter(isInside).map((n) => ({ ...n }) as PositionedNode);
  const outside = props.nodes.filter((n) => !isInside(n)).map((n) => ({ ...n }) as PositionedNode);

  // Inside processes: a compact honeycomb cluster (cells touch), packed
  // spiral-from-centre. Cell size scales down as the cluster grows.
  const n = inside.length;
  const rings = Math.max(1, Math.ceil((-3 + Math.sqrt(9 + 12 * Math.max(1, n - 1))) / 6));
  cellRadius = Math.max(26, Math.min(50, 130 / (rings + 0.5)));
  const cells = spiralHex(n);
  inside.forEach((node, i) => {
    const c = cells[i] ?? { x: 0, y: 0 };
    const p = axialToPixel(c.x, c.y, cellRadius, o);
    node.x = p.x;
    node.y = p.y;
  });

  // External peers spread on a canvas-filling ellipse (skipping the
  // bottom arc so the pod label stays clear), so the graph uses the
  // whole widget instead of clustering near the centre.
  positioned = [...inside, ...outside];
  const b = insideBoundary();
  const rx = Math.max(w / 2 - 64, b.r + 130);
  const ry = Math.max(h / 2 - 52, b.r + 96);
  const k = outside.length;
  const START_DEG = 305;
  const SPAN_DEG = 290; // leaves ~70° gap at the bottom
  outside.forEach((node, i) => {
    const t = k <= 1 ? 0.5 : i / (k - 1);
    const rad = (((START_DEG + t * SPAN_DEG) % 360) * Math.PI) / 180;
    node.x = o.x + rx * Math.cos(rad);
    node.y = o.y + ry * Math.sin(rad);
  });
  return positioned;
}

/** Smallest flat-top hexagon (centre + circumradius) that wraps the
 *  inside cells. Circumradius is inflated past the cell extent because a
 *  flat-top hexagon's inradius (along its flat edges) is only √3/2 of
 *  the circumradius — so cells sitting near a flat edge still fit. */
function insideBoundary(): { cx: number; cy: number; r: number } {
  const inside = positioned.filter(isInside);
  if (inside.length === 0) return { cx: 0, cy: 0, r: cellRadius * 1.4 };
  const cx = d3.mean(inside, (n) => n.x) ?? 0;
  const cy = d3.mean(inside, (n) => n.y) ?? 0;
  let maxD = 0;
  for (const n of inside) maxD = Math.max(maxD, Math.hypot(n.x - cx, n.y - cy));
  return { cx, cy, r: (maxD + cellRadius) * 1.16 + 4 };
}

function buildCalls(byId: Map<string, PositionedNode>): PositionedCall[] {
  const seen = new Set<string>();
  const out: PositionedCall[] = [];
  for (const c of props.calls) {
    const s = byId.get(c.source);
    const t = byId.get(c.target);
    if (!s || !t) continue;
    const lowerArc = seen.has(`${c.target}|${c.source}`);
    seen.add(`${c.source}|${c.target}`);
    out.push({ id: c.id, source: s, target: t, protocol: protocolOf(c), lowerArc });
  }
  return out;
}
/** Straight-line endpoints. A reverse-direction edge of the same pair is
 *  shifted onto a parallel track so the two directed lines stay visible
 *  instead of overlapping. */
function edgeEnds(c: PositionedCall): { sx: number; sy: number; tx: number; ty: number } {
  let sx = c.source.x;
  let sy = c.source.y;
  let tx = c.target.x;
  let ty = c.target.y;
  if (c.lowerArc) {
    const dx = tx - sx;
    const dy = ty - sy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * 7;
    const ny = (dx / len) * 7;
    sx += nx;
    sy += ny;
    tx += nx;
    ty += ny;
  }
  return { sx, sy, tx, ty };
}
function edgePath(c: PositionedCall): string {
  const e = edgeEnds(c);
  return `M ${e.sx} ${e.sy} L ${e.tx} ${e.ty}`;
}
function edgeMid(c: PositionedCall): Pt {
  const e = edgeEnds(c);
  return { x: (e.sx + e.tx) / 2, y: (e.sy + e.ty) / 2 };
}

// ── Node info popover (floating window) ─────────────────────────────
const nodePop = reactive<{ node: PositionedNode | null; x: number; y: number }>({
  node: null,
  x: 0,
  y: 0,
});
const popStyle = computed(() => {
  if (typeof window === 'undefined') return {};
  const W = 240;
  const H = 150;
  let x = nodePop.x + 14;
  let y = nodePop.y + 14;
  if (x + W > window.innerWidth - 8) x = nodePop.x - W - 14;
  if (y + H > window.innerHeight - 8) y = nodePop.y - H - 14;
  return { transform: `translate(${Math.max(8, x)}px, ${Math.max(8, y)}px)` };
});

let edgeSel: d3.Selection<SVGPathElement, PositionedCall, SVGGElement, unknown> | null = null;
let pillSel: d3.Selection<SVGGElement, PositionedCall, SVGGElement, unknown> | null = null;
let nodeSel: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown> | null = null;
let boundarySel: d3.Selection<SVGPathElement, unknown, null, undefined> | null = null;
let boundaryLabelSel: d3.Selection<SVGTextElement, unknown, null, undefined> | null = null;

function instanceLabel(): string {
  return props.nodes.find(isInside)?.serviceInstanceName ?? '';
}
function restyleEdges(): void {
  edgeSel
    ?.attr('stroke', (d) =>
      d.id === selectedCallId.value ? 'var(--sw-accent, #f97316)' : 'var(--sw-line-2, #3a3d47)',
    )
    .attr('stroke-width', (d) => (d.id === selectedCallId.value ? 2.6 : 1.5));
}
function redrawBoundary(): void {
  const b = insideBoundary();
  boundarySel?.attr('d', hexCellPath(b.cx, b.cy, b.r));
  boundaryLabelSel?.attr('x', b.cx).attr('y', b.cy + b.r + 16);
}
function refreshPositions(): void {
  edgeSel?.attr('d', edgePath);
  pillSel?.attr('transform', (d) => {
    const m = edgeMid(d);
    return `translate(${m.x},${m.y})`;
  });
  nodeSel?.attr('transform', (d) => `translate(${d.x},${d.y})`);
}

function render(): void {
  if (!host.value) return;
  host.value.innerHTML = '';
  nodePop.node = null;
  const rect = host.value.getBoundingClientRect();
  const w = rect.width || 720;
  const h = rect.height || 520;
  const o: Pt = { x: 0, y: 0 };

  positioned = layout(o, w, h);
  const byId = new Map(positioned.map((n) => [n.id, n]));
  const calls = buildCalls(byId);

  const svg = d3.select(host.value).append('svg').attr('width', w).attr('height', h);
  const root = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`);
  const g = root.append('g');
  svg.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (ev) => g.attr('transform', ev.transform.toString())) as never,
  );
  svg.on('click', () => {
    selectedCallId.value = null;
    nodePop.node = null;
    restyleEdges();
    emit('select-call', null);
  });

  svg
    .append('defs')
    .append('marker')
    .attr('id', 'arrow-pn')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 16)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5 L10,0 L0,5')
    .attr('fill', 'var(--sw-fg-3, #6c7080)');

  // Pod boundary — auto-fit to the inside cells, redrawn on drag.
  const b0 = insideBoundary();
  boundarySel = g
    .append('path')
    .attr('d', hexCellPath(b0.cx, b0.cy, b0.r))
    .attr('fill', 'var(--sw-bg-1, #15171c)')
    .attr('fill-opacity', 0.3)
    .attr('stroke', 'var(--sw-line, #2a2d36)')
    .attr('stroke-dasharray', '4 4')
    .attr('stroke-width', 1.5);
  boundaryLabelSel = g
    .append('text')
    .attr('x', b0.cx)
    .attr('y', b0.cy + b0.r + 16)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--sw-fg-2, #b4b7c2)')
    .style('font-family', 'var(--sw-mono, monospace)')
    .style('font-size', '13px')
    .text(instanceLabel());

  // Edges (animated flow).
  const linkG = g.append('g').attr('class', 'links');
  edgeSel = linkG
    .selectAll<SVGPathElement, PositionedCall>('path.edge')
    .data(calls)
    .enter()
    .append('path')
    .attr('class', 'edge flow')
    .attr('fill', 'none')
    .attr('marker-end', 'url(#arrow-pn)')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => {
      ev.stopPropagation();
      selectedCallId.value = d.id;
      nodePop.node = null;
      restyleEdges();
      emit('select-call', props.calls.find((c) => c.id === d.id) ?? null);
    });

  pillSel = linkG
    .selectAll<SVGGElement, PositionedCall>('g.pill')
    .data(calls)
    .enter()
    .append('g')
    .attr('class', 'pill')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => {
      ev.stopPropagation();
      selectedCallId.value = d.id;
      nodePop.node = null;
      restyleEdges();
      emit('select-call', props.calls.find((c) => c.id === d.id) ?? null);
    });
  pillSel
    .append('rect')
    .attr('x', -19)
    .attr('y', -7)
    .attr('width', 38)
    .attr('height', 14)
    .attr('rx', 7)
    .attr('fill', 'var(--sw-bg-2, #1f2129)')
    .attr('stroke', 'var(--sw-line, #2a2d36)');
  pillSel
    .append('text')
    .attr('text-anchor', 'middle')
    .attr('dy', '0.32em')
    .attr('fill', 'var(--sw-fg-2, #b4b7c2)')
    .style('font-family', 'var(--sw-mono, monospace)')
    .style('font-size', '9px')
    .text((d) => d.protocol);

  // Nodes — hex cells (inside = accent, external = grey).
  nodeSel = g
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGGElement, PositionedNode>('g.node')
    .data(positioned, (d) => d.id)
    .enter()
    .append('g')
    .attr('class', 'node')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => {
      ev.stopPropagation();
      nodePop.node = d;
      nodePop.x = (ev as MouseEvent).clientX;
      nodePop.y = (ev as MouseEvent).clientY;
    })
    .call(
      d3
        .drag<SVGGElement, PositionedNode>()
        .on('start', () => {
          nodePop.node = null;
        })
        .on('drag', (ev, d) => {
          d.x = ev.x;
          d.y = ev.y;
          refreshPositions();
          // Dragging an inside cell reshapes the pod boundary; external
          // peers stay put (anchored to the canvas).
          if (isInside(d)) redrawBoundary();
        }) as never,
    );
  nodeSel
    .append('path')
    .attr('d', (d) => hexCellPath(0, 0, isInside(d) ? cellRadius * 0.92 : 18))
    .attr('fill', (d) => (isInside(d) ? 'var(--sw-accent, #f97316)' : 'var(--sw-bg-3, #2a2d36)'))
    .attr('fill-opacity', (d) => (isInside(d) ? 0.85 : 0.75))
    .attr('stroke', 'var(--sw-bg-0, #0d0f14)')
    .attr('stroke-width', 1.5);
  // Inside cells touch, so their labels alternate BELOW / ABOVE the
  // honeycomb by index (cell 0 below, cell 1 above, cell 2 below, …) to
  // avoid colliding with neighbours. External peers always label below
  // their (isolated) cell. `positioned` is [inside…, outside…] so the
  // datum index `i` is the inside index for inside cells.
  function labelY(d: PositionedNode, i: number): number {
    if (!isInside(d)) return 30;
    return i % 2 === 1 ? -(cellRadius + 8) : cellRadius + 16;
  }
  nodeSel
    .append('text')
    .attr('x', 0)
    .attr('y', labelY)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--sw-fg-1, #d4d6dd)')
    .style('font-family', 'var(--sw-mono, monospace)')
    .style('font-size', '12px')
    .style('font-weight', '600')
    .text((d) => {
      const base = d.name.split('.')[0];
      return base.length > 14 ? `${base.slice(0, 14)}…` : base;
    });

  refreshPositions();
  restyleEdges();
}

onMounted(render);
watch(() => [props.nodes, props.calls], render);
onBeforeUnmount(() => {
  if (host.value) host.value.innerHTML = '';
});
</script>

<template>
  <div class="topo-wrap">
    <div ref="host" class="topo-host"></div>
    <!-- Node info floating popover -->
    <Teleport to="body">
      <div v-if="nodePop.node" class="topo-nodepop" :style="popStyle" role="tooltip">
        <div class="np-name">{{ nodePop.node.name }}</div>
        <dl class="np-rows">
          <div class="np-row"><dt>Kind</dt><dd>{{ nodePop.node.isReal ? 'process' : 'virtual peer' }}</dd></div>
          <div class="np-row"><dt>Service</dt><dd>{{ nodePop.node.serviceName }}</dd></div>
          <div class="np-row"><dt>Instance</dt><dd>{{ nodePop.node.serviceInstanceName }}</dd></div>
        </dl>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.topo-wrap { position: relative; width: 100%; height: 100%; min-height: 360px; }
.topo-host {
  width: 100%;
  height: 100%;
  min-height: 360px;
  overflow: hidden;
  background: var(--sw-bg-0, #0d0f14);
}
/* Animated traffic-flow dashes on edges (source → target). */
.topo-host :deep(path.flow) {
  stroke-dasharray: 6 5;
  animation: topo-flow 0.9s linear infinite;
}
@keyframes topo-flow {
  to { stroke-dashoffset: -11; }
}
</style>

<style>
/* Node popover lives in <body> via Teleport. */
.topo-nodepop {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 9000;
  width: max-content;
  max-width: 240px;
  pointer-events: none;
  background: var(--sw-bg-1, #1b1d24);
  border: 1px solid var(--sw-line, #2a2d36);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
  padding: 9px 11px;
  font-size: 11px;
  color: var(--sw-fg-1, #d4d6de);
}
.topo-nodepop .np-name {
  font-family: var(--sw-mono, monospace);
  font-weight: 600;
  color: var(--sw-fg-0, #f5f7fb);
  margin-bottom: 6px;
  overflow-wrap: anywhere;
}
.topo-nodepop .np-rows { margin: 0; display: flex; flex-direction: column; gap: 3px; }
.topo-nodepop .np-row { display: grid; grid-template-columns: 80px 1fr; gap: 8px; }
.topo-nodepop .np-row dt { margin: 0; color: var(--sw-fg-3, #6b6f7a); }
.topo-nodepop .np-row dd { margin: 0; color: var(--sw-fg-0, #f5f7fb); overflow-wrap: anywhere; }
</style>
