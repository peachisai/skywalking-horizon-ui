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
  Thin ECharts wrapper for multi-series line charts. Used by the
  per-layer Dashboards widgets. Owns its instance lifecycle and resizes
  with the container — the parent gives us a fixed pixel height.

  Per project convention this is the *only* place ECharts is touched —
  no view component imports echarts directly. Swap-out point if we
  decide to move away from ECharts later.
-->
<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsType } from 'echarts/core';

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer]);

interface Series {
  label: string;
  data: Array<number | null>;
}

const props = withDefaults(
  defineProps<{
    series: Series[];
    height?: number;
    /** Optional unit suffix shown in the tooltip. */
    unit?: string;
    /** Color hint for the first series (subsequent series cycle through
     *  a default palette so percentile lines remain distinguishable). */
    accent?: string;
  }>(),
  {
    height: 180,
    accent: 'var(--sw-accent)',
  },
);

/**
 * Resolve a CSS variable like `var(--sw-accent)` to its computed RGB
 * by querying the document root. ECharts doesn't honor CSS vars on
 * canvas-rendered series, so we evaluate once and feed the hex. Falls
 * back to the orange accent when the variable resolves empty.
 */
function cssVar(token: string): string {
  if (!token.startsWith('var(')) return token;
  if (typeof window === 'undefined') return '#f97316';
  const name = token.replace(/^var\(\s*/, '').replace(/\s*\)\s*$/, '');
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || '#f97316';
}

/**
 * Secondary palette for multi-line widgets (e.g., percentile relabels
 * → 5 series). The first series uses the widget's accent (or the
 * accent prop); subsequent lines pick from this palette so the lines
 * are distinguishable. Picks deliberately don't reuse the accent.
 */
const SECONDARY = [
  '#60a5fa', // info-ish (blue)
  '#a78bfa', // purple
  '#22d3ee', // cyan
  '#f472b6', // pink
  '#34d399', // ok-ish (green)
  '#fbbf24', // amber
];

const container = ref<HTMLDivElement | null>(null);
let chart: EChartsType | null = null;

function buildOption(): echarts.EChartsCoreOption {
  // Generate equal-spaced bucket indices for the x-axis. We don't have
  // explicit timestamps from the BFF response (the duration window is
  // implied to be MINUTE-stepped over the last 15m), so we label the
  // axis with relative "-Nm" markers.
  const length = props.series[0]?.data.length ?? 0;
  const xLabels = Array.from({ length }, (_, i) => `-${length - i - 1}m`);
  return {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      backgroundColor: 'rgba(20,20,24,0.92)',
      borderColor: 'rgba(255,255,255,0.08)',
      textStyle: { color: '#e5e7eb', fontSize: 11 },
      valueFormatter: (v: unknown) =>
        typeof v === 'number' && Number.isFinite(v)
          ? `${v.toFixed(2)}${props.unit ? ` ${props.unit}` : ''}`
          : '—',
    },
    legend: {
      show: props.series.length > 1,
      top: 0,
      left: 0,
      textStyle: { color: '#94a3b8', fontSize: 10 },
      itemWidth: 10,
      itemHeight: 8,
      itemGap: 12,
      icon: 'roundRect',
    },
    grid: {
      left: 36,
      right: 8,
      top: props.series.length > 1 ? 22 : 8,
      bottom: 8,
      containLabel: false,
    },
    xAxis: {
      type: 'category',
      data: xLabels,
      axisLine: { lineStyle: { color: 'rgba(255,255,255,0.08)' } },
      axisLabel: { color: '#64748b', fontSize: 9, interval: Math.floor(length / 6) },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisLabel: { color: '#64748b', fontSize: 9 },
      splitLine: { lineStyle: { color: 'rgba(255,255,255,0.06)' } },
    },
    series: props.series.map((s, i) => {
      // First series uses the widget's accent color (resolved from a
      // CSS var); secondary lines cycle through SECONDARY. Single-series
      // widgets get a soft area fill in the accent tone.
      const accentHex = cssVar(props.accent);
      const color = i === 0 ? accentHex : SECONDARY[(i - 1) % SECONDARY.length];
      return {
        name: s.label,
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 1.5 },
        data: s.data.map((v) => (v === null ? '-' : v)),
        itemStyle: { color },
        areaStyle:
          props.series.length === 1
            ? { color: accentHex, opacity: 0.12 }
            : undefined,
      };
    }),
  };
}

onMounted(() => {
  if (!container.value) return;
  chart = echarts.init(container.value, null, { renderer: 'canvas' });
  chart.setOption(buildOption());
  const ro = new ResizeObserver(() => chart?.resize());
  ro.observe(container.value);
  onBeforeUnmount(() => {
    ro.disconnect();
    chart?.dispose();
    chart = null;
  });
});

watch(
  () => props.series,
  () => chart?.setOption(buildOption(), { replaceMerge: ['series'] }),
  { deep: true },
);
watch(
  () => props.unit,
  () => chart?.setOption(buildOption()),
);
watch(
  () => props.accent,
  () => chart?.setOption(buildOption(), { replaceMerge: ['series'] }),
);
</script>

<template>
  <div ref="container" class="time-chart" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.time-chart {
  width: 100%;
}
</style>
