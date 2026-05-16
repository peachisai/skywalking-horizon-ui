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
  Alarms timeline. Multi-line background traffic (RPM) over the window
  with alarm markers overlaid as colored dots at each alarm's start
  time. The X axis is real epoch-ms (time type), not category-indexed
  buckets, so alarms anchor at their actual timestamp without needing
  the caller to align them to traffic buckets.

  Interactions:
   - Click an alarm dot          → emits `select-alarm` with that id.
   - Drag a region on the chart  → emits `select-time-range` with
                                   `{startTime, endTime}` (ms).
   - Click the chart background  → emits `clear-selection`.

  This is the page's headline widget — kept inline rather than in
  TimeChart because the alarm-flag overlay + brush behavior don't
  belong in the per-layer dashboards' generic line chart wrapper.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart } from 'echarts/charts';
import {
  BrushComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  ToolboxComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';
import type { AlarmMessage, AlarmTrafficSeries } from '@/api/client';

echarts.use([
  LineChart,
  ScatterChart,
  BrushComponent,
  GridComponent,
  LegendComponent,
  MarkLineComponent,
  TooltipComponent,
  ToolboxComponent,
  CanvasRenderer,
]);

const props = defineProps<{
  /** Aligned, per-layer RPM series (one line per layer). */
  traffic: AlarmTrafficSeries[];
  /** Alarms to overlay as dots at their startTime. */
  alarms: AlarmMessage[];
  startTime: number;
  endTime: number;
  height?: number;
  /** Composite key `${alarm.id}::${alarm.startTime}` — OAP's `id`
   *  alone collapses every firing of the same rule on the same
   *  entity, so we key selection by (id + startTime) instead. */
  selectedAlarmKey?: string | null;
}>();

const emit = defineEmits<{
  (e: 'select-alarm', alarmKey: string): void;
  (e: 'select-time-range', range: { startTime: number; endTime: number }): void;
  (e: 'clear-selection'): void;
}>();

function keyFor(a: AlarmMessage): string {
  return `${a.id}::${a.startTime}`;
}

const PALETTE = [
  '#f97316', // orange (accent)
  '#60a5fa', // blue
  '#22d3ee', // cyan
  '#a78bfa', // purple
  '#34d399', // green
  '#f472b6', // pink
];

const container = ref<HTMLDivElement | null>(null);
let chart: EChartsType | null = null;

function trafficSeriesOption(s: AlarmTrafficSeries, idx: number, addNowMark: boolean) {
  const color = PALETTE[idx % PALETTE.length];
  return {
    name: s.label,
    type: 'line',
    showSymbol: false,
    smooth: true,
    lineStyle: { width: 1.5, color, opacity: s.present ? 0.85 : 0.25 },
    areaStyle: s.present
      ? {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: color + '33' },
            { offset: 1, color: color + '00' },
          ]),
        }
      : undefined,
    data: s.points.map((p) => [p.ts, p.value]),
    // Anchor the `now` reference line on the first series only —
    // ECharts collapses markLines from multiple series so we only
    // need it once. Drawn as a faint vertical dashed rule the
    // operator uses to gauge "is the data current or stale?".
    markLine: addNowMark
      ? {
          symbol: 'none',
          silent: true,
          lineStyle: { color: 'rgba(255,255,255,0.25)', type: 'dashed', width: 1 },
          label: {
            show: true,
            position: 'insideEndTop',
            color: 'rgba(255,255,255,0.5)',
            fontSize: 10,
            formatter: 'now',
          },
          data: [{ xAxis: Date.now() }],
        }
      : undefined,
    z: 1,
  };
}

/* Bucket alarms by layerKey AND pair each layer with the same color
 * the traffic series uses for that layer. Result is one scatter
 * series per layer, color-matched to its traffic line, so the
 * legend reads layer-by-layer instead of one undifferentiated
 * "Alarms" lump. Unmatched alarms (layerKey null, or layer not in
 * the traffic config) fall into an "Other" bucket with a neutral
 * grey + a diamond marker so the operator can still see them. */
interface AlarmBucket {
  layerKey: string;
  label: string;
  color: string;
  symbol: 'pin' | 'diamond';
  alarms: AlarmMessage[];
}

function bucketAlarmsByLayer(): AlarmBucket[] {
  // Layer order from the traffic config drives the legend order.
  const buckets = new Map<string, AlarmBucket>();
  props.traffic.forEach((s, idx) => {
    buckets.set(s.layerKey, {
      layerKey: s.layerKey,
      label: s.label,
      color: PALETTE[idx % PALETTE.length],
      symbol: 'pin',
      alarms: [],
    });
  });
  const otherKey = '__other__';
  for (const a of props.alarms) {
    const k = a.layerKey ?? '';
    let target = k && buckets.get(k);
    if (!target) {
      target = buckets.get(otherKey);
      if (!target) {
        target = {
          layerKey: otherKey,
          label: 'Other',
          color: '#818a9c',
          symbol: 'diamond',
          alarms: [],
        };
        buckets.set(otherKey, target);
      }
    }
    target.alarms.push(a);
  }
  // Drop empty buckets so we don't pollute the legend with layers
  // that have no alarms in the window.
  return Array.from(buckets.values()).filter((b) => b.alarms.length > 0);
}

function alarmSeriesFor(bucket: AlarmBucket) {
  const seriesName = `${bucket.label} · alarms (${bucket.alarms.length})`;
  const data = bucket.alarms.map((a) => {
    const firing = a.recoveryTime === null;
    const k = keyFor(a);
    const selected = k === props.selectedAlarmKey;
    return {
      value: [a.startTime, 0],
      // `name` carries the composite (id + startTime) so the click
      // handler emits the right key — ECharts echoes back data.name
      // on click. id alone collapses every firing of one rule.
      name: k,
      itemStyle: {
        // Firing alarms keep the layer color full-saturation; recovered
        // ones drop opacity so the operator can tell active from past
        // at a glance without losing the layer mapping.
        color: bucket.color,
        opacity: firing ? 1 : 0.4,
        borderColor: selected ? '#fff' : 'transparent',
        borderWidth: selected ? 1.5 : 0,
      },
      alarm: a,
    };
  });
  return {
    name: seriesName,
    type: 'scatter',
    yAxisIndex: 1,
    symbol: bucket.symbol === 'pin' ? 'pin' : 'diamond',
    symbolSize: 14,
    z: 5,
    data,
    tooltip: {
      formatter: (params: unknown): string => {
        const p = params as { data: { alarm: AlarmMessage } };
        const a = p.data.alarm;
        const firing = a.recoveryTime === null;
        const time = new Date(a.startTime).toLocaleString();
        return [
          `<div style="font-weight:600;color:${bucket.color};">${escapeHtml(bucket.label)} · ${firing ? 'firing' : 'recovered'}</div>`,
          `<div style="margin-top:4px;font-size:11px;color:var(--sw-fg-0);">${escapeHtml(a.message)}</div>`,
          `<div style="margin-top:2px;font-size:10.5px;color:var(--sw-fg-2);">${escapeHtml(a.name)}</div>`,
          `<div style="margin-top:2px;font-size:10.5px;color:var(--sw-fg-3);">${time}</div>`,
        ].join('');
      },
    },
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOption(): echarts.EChartsCoreOption {
  const alarmBuckets = bucketAlarmsByLayer();
  return {
    animation: false,
    grid: { left: 48, right: 12, top: 36, bottom: 22 },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'line', lineStyle: { color: 'rgba(255,255,255,0.15)' } },
      backgroundColor: 'rgba(15,20,29,0.95)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#e8ecf3', fontSize: 11 },
      extraCssText: 'box-shadow: 0 4px 16px rgba(0,0,0,0.4);',
    },
    legend: {
      top: 4,
      left: 8,
      itemWidth: 10,
      itemHeight: 8,
      textStyle: { color: '#b6bdcc', fontSize: 11 },
      type: 'scroll',
      data: [
        // Traffic lines first, then alarm flag series per layer.
        // Names match the `name` we assign on each series — ECharts
        // pairs them by string identity.
        ...props.traffic.map((s) => s.label),
        ...alarmBuckets.map((b) => `${b.label} · alarms (${b.alarms.length})`),
      ],
    },
    brush: {
      toolbox: ['lineX', 'clear'],
      xAxisIndex: 0,
      brushStyle: { color: 'rgba(249,115,22,0.18)', borderColor: 'rgba(249,115,22,0.6)' },
      throttleType: 'debounce',
      throttleDelay: 200,
    },
    toolbox: {
      show: true,
      top: 2,
      right: 8,
      itemSize: 12,
      feature: {
        brush: {
          type: ['lineX', 'clear'],
          title: { lineX: 'select time range', clear: 'clear' } as Record<string, string>,
          icon: {
            // ECharts default icons render fine; just style the text colour.
          } as Record<string, string>,
        },
      },
      iconStyle: { borderColor: '#818a9c' },
    },
    xAxis: {
      type: 'time',
      min: props.startTime,
      max: props.endTime,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
      splitLine: { show: false },
    },
    yAxis: [
      {
        // Traffic axis (left).
        type: 'value',
        name: 'RPM',
        nameTextStyle: { color: '#64748b', fontSize: 10, padding: [0, 0, 0, -4] },
        axisLine: { show: false },
        axisLabel: { color: '#64748b', fontSize: 10 },
        splitLine: { lineStyle: { color: 'rgba(255,255,255,0.04)' } },
      },
      {
        // Alarms axis — hidden, just a fixed band so the scatter dots
        // sit on a horizontal line at the bottom of the plot.
        type: 'value',
        show: false,
        min: -1,
        max: 1,
      },
    ],
    series: [
      ...props.traffic.map((s, i) => trafficSeriesOption(s, i, i === 0)),
      ...alarmBuckets.map((b) => alarmSeriesFor(b)),
    ],
  };
}

function attach(): void {
  if (!container.value) return;
  chart = echarts.init(container.value, undefined, { renderer: 'canvas' });
  chart.setOption(buildOption());

  chart.on('click', (params: unknown) => {
    // All alarm scatter series have `seriesType: 'scatter'` plus an
    // `alarm` field on the datum. Discriminate by series type rather
    // than name so the new per-layer series names (e.g. "Mesh ·
    // alarms (3)") all match without a regex.
    const p = params as {
      seriesType?: string;
      data?: { name?: string; alarm?: AlarmMessage };
    };
    if (p.seriesType === 'scatter' && p.data?.alarm && p.data.name) {
      emit('select-alarm', p.data.name);
    }
  });

  /* Brush emits two events: `brushSelected` while the user drags AND
   * a final one after release. We listen to `brushEnd` so we only
   * commit a range when the gesture finishes. */
  chart.on('brushEnd', (params: unknown) => {
    const p = params as {
      areas: Array<{ brushType: string; coordRange: [number, number] }>;
    };
    const area = p.areas?.[0];
    if (!area || area.brushType !== 'lineX') {
      emit('clear-selection');
      return;
    }
    const [a, b] = area.coordRange;
    const startTime = Math.min(a, b);
    const endTime = Math.max(a, b);
    emit('select-time-range', { startTime, endTime });
  });
}

function refresh(): void {
  if (!chart) return;
  chart.setOption(buildOption(), { replaceMerge: ['series', 'legend'] });
}

onMounted(() => {
  attach();
  if (typeof window !== 'undefined') window.addEventListener('resize', resize);
});
function resize(): void {
  chart?.resize();
}
onBeforeUnmount(() => {
  if (typeof window !== 'undefined') window.removeEventListener('resize', resize);
  chart?.dispose();
  chart = null;
});

watch(
  () => [props.traffic, props.alarms, props.startTime, props.endTime, props.selectedAlarmKey],
  () => refresh(),
  { deep: true },
);
</script>

<template>
  <div ref="container" class="alarms-timeline" :style="{ height: `${height ?? 200}px` }" />
</template>

<style scoped>
.alarms-timeline {
  width: 100%;
}
</style>
