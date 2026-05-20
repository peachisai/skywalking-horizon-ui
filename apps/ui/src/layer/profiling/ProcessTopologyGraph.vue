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
  Process-level topology for network profiling — booster-ui hexagon
  layout. The hexagon boundary represents the profiled service instance
  (pod): processes that live INSIDE the pod (`isReal` or the synthetic
  `UNKNOWN_LOCAL`) are laid out on a hex grid inside the boundary;
  external peers (other pods / services the eBPF probe saw traffic to)
  sit on concentric rings OUTSIDE it. Each node is an isometric "cube"
  glyph standing in for a container/process. Positions are computed
  (not force-simulated) so the map is stable; nodes are draggable.
  Edges are directed quadratic-bezier curves with a protocol pill and
  are clickable (drives the edge detail panel).

  Emits:
    select-node — full ProcessNode object (or null)
    select-call — full ProcessCall object (or null)
-->
<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import * as d3 from 'd3';
import type { ProcessCall, ProcessNode } from '@/api/client';

interface Pt { x: number; y: number }
type PositionedNode = ProcessNode & Pt;
interface PositionedCall {
  id: string;
  source: PositionedNode;
  target: PositionedNode;
  detectPoints: string[];
  protocol: string;
  lowerArc: boolean;
}

const props = defineProps<{ nodes: ProcessNode[]; calls: ProcessCall[] }>();
const emit = defineEmits<{
  (e: 'select-node', n: ProcessNode | null): void;
  (e: 'select-call', c: ProcessCall | null): void;
}>();

const host = ref<HTMLDivElement | null>(null);
const selectedNodeId = ref<string | null>(null);
const selectedCallId = ref<string | null>(null);

// ── Hexagon layout primitives (flat-top orientation), ported from
//    booster-ui's network-profiling Graph/layout.ts. ──────────────────
const SQRT3 = Math.sqrt(3);
const HEX_RADIUS = 210; // pod boundary radius

/** Flat-top axial → pixel. */
function axialToPixel(ax: number, ay: number, r: number, origin: Pt): Pt {
  return {
    x: ((3 / 2) * ax) * r + origin.x,
    y: ((SQRT3 / 2) * ax + SQRT3 * ay) * r + origin.y,
  };
}
/** Hex grid of ring-count `n` at the given spacing radius. n=1 ⇒ 7 cells. */
function hexGrid(n: number, r: number, origin: Pt): Pt[] {
  const pos: Pt[] = [];
  for (let x = -n; x <= n; x++) {
    const yLo = Math.max(-n, -x - n);
    const yHi = Math.min(n, -x + n);
    for (let y = yLo; y <= yHi; y++) pos.push(axialToPixel(x, y, r, origin));
  }
  return pos;
}
/** Points around a circle, skipping the 230°–310° arc so the bottom
 *  stays clear for the instance label (matches booster). */
function circlePoints(r: number, stepDeg: number, origin: Pt): Pt[] {
  const out: Pt[] = [];
  for (let deg = 0; deg < 360; deg += stepDeg) {
    if (deg >= 230 && deg <= 310) continue;
    const rad = (Math.PI * 2 * deg) / 360;
    out.push({ x: Math.cos(rad) * r + origin.x, y: Math.sin(rad) * r + origin.y });
  }
  return out;
}
/** Closed hexagon boundary path string. */
function hexBoundaryPath(r: number, origin: Pt): string {
  const verts: [number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const rad = Math.PI * 2 * (i / 6);
    verts.push([Math.cos(rad) * r + origin.x, Math.sin(rad) * r + origin.y]);
  }
  const line = d3.line().curve(d3.curveLinearClosed);
  return line(verts) ?? '';
}
function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isInside(n: ProcessNode): boolean {
  return n.isReal || n.name === 'UNKNOWN_LOCAL';
}
function protocolOf(c: ProcessCall): string {
  const types = [...(c.sourceComponents ?? []), ...(c.targetComponents ?? [])].map((t) =>
    t.toLowerCase(),
  );
  if (types.includes('https')) return 'HTTPS';
  if (types.includes('tls')) return 'TLS';
  if (types.includes('http')) return 'HTTP';
  return 'TCP';
}

/** Compute fixed positions for inside (hex grid) + outside (rings). */
function layout(origin: Pt): PositionedNode[] {
  const inside = props.nodes.filter(isInside).map((n) => ({ ...n }) as PositionedNode);
  const outside = props.nodes.filter((n) => !isInside(n)).map((n) => ({ ...n }) as PositionedNode);

  const count = inside.length;
  let cells: Pt[];
  if (count > 7) {
    // Sub-divide each of the 7 macro-cells into a small cluster, then
    // thin the cluster by total count so dense pods stay readable.
    const macro = hexGrid(1, 68, origin);
    const cubes: Pt[] = [];
    for (const c of macro) {
      let sub = hexGrid(1, 20, c);
      if (count < 15) sub = [sub[0], sub[5]];
      else if (count < 22) sub = [sub[0], sub[2], sub[5]];
      cubes.push(...sub);
    }
    cells = shuffle(cubes);
  } else {
    cells = hexGrid(1, 68, origin);
  }
  inside.forEach((n, i) => {
    const p = cells[i] ?? origin;
    n.x = p.x;
    n.y = p.y;
  });

  // Outside peers on expanding rings.
  let r = 250;
  let ring = circlePoints(r, 30, origin);
  outside.forEach((n, i) => {
    if (!ring[i]) {
      r += 80;
      ring = [...ring, ...circlePoints(r, 30, origin)];
    }
    const p = ring[i] ?? { x: origin.x, y: origin.y - r };
    n.x = p.x;
    n.y = p.y;
  });

  return [...inside, ...outside];
}

function buildCalls(byId: Map<string, PositionedNode>): PositionedCall[] {
  const seen = new Set<string>();
  const out: PositionedCall[] = [];
  for (const c of props.calls) {
    const s = byId.get(c.source);
    const t = byId.get(c.target);
    if (!s || !t) continue;
    // Reverse direction of an already-seen pair arcs the opposite way
    // so the two directed edges don't overlap.
    const fwd = `${c.source}|${c.target}`;
    const rev = `${c.target}|${c.source}`;
    const lowerArc = seen.has(rev);
    seen.add(fwd);
    out.push({
      id: c.id,
      source: s,
      target: t,
      detectPoints: c.detectPoints ?? [],
      protocol: protocolOf(c),
      lowerArc,
    });
  }
  return out;
}

// Quadratic-bezier control point perpendicular to the s→t chord.
function controlPoint(s: Pt, t: Pt, lowerArc: boolean): Pt {
  const dx = t.x - s.x;
  const dy = t.y - s.y;
  const theta = Math.atan2(dy, dx) - Math.PI / 2;
  const len = (Math.sqrt(dx * dx + dy * dy) / 2) * 0.5;
  const cx = (s.x + t.x) / 2 + len * Math.cos(theta);
  let cy = (s.y + t.y) / 2 + len * Math.sin(theta);
  if (lowerArc) cy = (s.y + t.y) - cy;
  return { x: cx, y: cy };
}
function edgePath(c: PositionedCall): string {
  const s = { x: c.source.x, y: c.source.y };
  const t = { x: c.target.x, y: c.target.y };
  const cp = controlPoint(s, t, c.lowerArc);
  return `M ${s.x} ${s.y} Q ${cp.x} ${cp.y} ${t.x} ${t.y}`;
}
function edgeMid(c: PositionedCall): Pt {
  const s = { x: c.source.x, y: c.source.y };
  const t = { x: c.target.x, y: c.target.y };
  const cp = controlPoint(s, t, c.lowerArc);
  // midpoint of the quadratic bezier at t=0.5
  return {
    x: 0.25 * s.x + 0.5 * cp.x + 0.25 * t.x,
    y: 0.25 * s.y + 0.5 * cp.y + 0.25 * t.y,
  };
}

// ── Cube glyph — isometric box drawn around (0,0). ──────────────────
function appendCube(g: d3.Selection<SVGGElement, unknown, null, undefined>, inside: boolean): void {
  const w = 13; // half width
  const h = 7; // top-face half height
  const d = 14; // body depth
  const topFill = inside ? 'var(--sw-accent, #f97316)' : 'var(--sw-bg-3, #2a2d36)';
  const leftFill = inside ? 'var(--sw-accent-2, #c2570f)' : 'var(--sw-bg-2, #1f2129)';
  const rightFill = inside ? '#8a3d0a' : 'var(--sw-bg-1, #15171c)';
  const stroke = 'var(--sw-line-2, #3a3d47)';
  // top rhombus
  g.append('path')
    .attr('d', `M 0 ${-h - d / 2} L ${w} ${-d / 2} L 0 ${h - d / 2} L ${-w} ${-d / 2} Z`)
    .attr('fill', topFill)
    .attr('stroke', stroke)
    .attr('stroke-width', 1);
  // left face
  g.append('path')
    .attr('d', `M ${-w} ${-d / 2} L 0 ${h - d / 2} L 0 ${h + d / 2} L ${-w} ${d / 2} Z`)
    .attr('fill', leftFill)
    .attr('stroke', stroke)
    .attr('stroke-width', 1);
  // right face
  g.append('path')
    .attr('d', `M ${w} ${-d / 2} L 0 ${h - d / 2} L 0 ${h + d / 2} L ${w} ${d / 2} Z`)
    .attr('fill', rightFill)
    .attr('stroke', stroke)
    .attr('stroke-width', 1);
}

let positioned: PositionedNode[] = [];
let edgeSel: d3.Selection<SVGPathElement, PositionedCall, SVGGElement, unknown> | null = null;
let pillSel: d3.Selection<SVGGElement, PositionedCall, SVGGElement, unknown> | null = null;
let nodeSel: d3.Selection<SVGGElement, PositionedNode, SVGGElement, unknown> | null = null;

function instanceLabel(): string {
  const inside = props.nodes.find(isInside);
  return inside?.serviceInstanceName ?? '';
}

function restyleEdges(): void {
  edgeSel
    ?.attr('stroke', (d) =>
      d.id === selectedCallId.value ? 'var(--sw-accent, #f97316)' : 'var(--sw-line-2, #3a3d47)',
    )
    .attr('stroke-width', (d) => (d.id === selectedCallId.value ? 2.4 : 1.4));
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
  const rect = host.value.getBoundingClientRect();
  const w = rect.width || 720;
  const h = rect.height || 520;
  const origin: Pt = { x: 0, y: 0 };

  positioned = layout(origin);
  const byId = new Map(positioned.map((n) => [n.id, n]));
  const calls = buildCalls(byId);

  const svg = d3.select(host.value).append('svg').attr('width', w).attr('height', h);
  // Root group is centred; zoom/pan rides on top.
  const root = svg.append('g').attr('transform', `translate(${w / 2},${h / 2})`);
  const g = root.append('g');
  svg.call(
    d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.3, 3])
      .on('zoom', (ev) => g.attr('transform', ev.transform.toString())) as never,
  );
  // Click empty canvas → clear selection.
  svg.on('click', () => {
    selectedNodeId.value = null;
    selectedCallId.value = null;
    restyleEdges();
    emit('select-node', null);
    emit('select-call', null);
  });

  svg
    .append('defs')
    .append('marker')
    .attr('id', 'arrow-pn')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 18)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5 L10,0 L0,5')
    .attr('fill', 'var(--sw-fg-3, #6c7080)');

  // Hexagon boundary + instance label.
  g.append('path')
    .attr('d', hexBoundaryPath(HEX_RADIUS, origin))
    .attr('fill', 'var(--sw-bg-1, #15171c)')
    .attr('fill-opacity', 0.35)
    .attr('stroke', 'var(--sw-line, #2a2d36)')
    .attr('stroke-width', 1.5);
  g.append('text')
    .attr('x', origin.x)
    .attr('y', origin.y + HEX_RADIUS + 18)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--sw-fg-2, #b4b7c2)')
    .style('font-family', 'var(--sw-mono, monospace)')
    .style('font-size', '11px')
    .text(instanceLabel());

  // Edges.
  const linkG = g.append('g').attr('class', 'links');
  edgeSel = linkG
    .selectAll<SVGPathElement, PositionedCall>('path.edge')
    .data(calls)
    .enter()
    .append('path')
    .attr('class', 'edge')
    .attr('fill', 'none')
    .attr('stroke-dasharray', '5 4')
    .attr('marker-end', 'url(#arrow-pn)')
    .style('cursor', 'pointer')
    .on('click', (ev, d) => {
      ev.stopPropagation();
      selectedCallId.value = d.id;
      selectedNodeId.value = null;
      restyleEdges();
      emit('select-call', props.calls.find((c) => c.id === d.id) ?? null);
    });

  // Protocol pills at edge midpoints.
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
      selectedNodeId.value = null;
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

  // Nodes.
  nodeSel = g
    .append('g')
    .attr('class', 'nodes')
    .selectAll<SVGGElement, PositionedNode>('g.node')
    .data(positioned, (d) => d.id)
    .enter()
    .append('g')
    .attr('class', 'node')
    .style('cursor', 'grab')
    .on('click', (ev, d) => {
      ev.stopPropagation();
      selectedNodeId.value = d.id;
      selectedCallId.value = null;
      restyleEdges();
      emit('select-node', props.nodes.find((n) => n.id === d.id) ?? null);
    })
    .call(
      d3
        .drag<SVGGElement, PositionedNode>()
        .on('drag', (ev, d) => {
          d.x = ev.x;
          d.y = ev.y;
          refreshPositions();
        }) as never,
    );
  nodeSel.each(function (d) {
    appendCube(d3.select(this), isInside(d));
  });
  nodeSel
    .append('text')
    .attr('x', 0)
    .attr('y', 22)
    .attr('text-anchor', 'middle')
    .attr('fill', 'var(--sw-fg-1, #d4d6dd)')
    .style('font-family', 'var(--sw-mono, monospace)')
    .style('font-size', '10.5px')
    .text((d) => (d.name.length > 16 ? `${d.name.slice(0, 16)}…` : d.name));

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
  <div ref="host" class="topo-host"></div>
</template>

<style scoped>
.topo-host {
  width: 100%;
  height: 100%;
  min-height: 360px;
  overflow: hidden;
  background: var(--sw-bg-0, #0d0f14);
}
</style>
