/*
 * Licensed to the Apache Software Foundation (ASF) under one or more
 * contributor license agreements.  See the NOTICE file distributed with
 * this work for additional information regarding copyright ownership.
 * The ASF licenses this file to You under the Apache License, Version 2.0
 * (the "License"); you may not use this file except in compliance with
 * the License.  You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/** Compact numeric formatter for overview KPI tiles. Values fall back to
 *  `—` when null/undefined/NaN; integers display without decimals;
 *  fractional values round to 2 dp; large values get k/M suffixes. */
export function formatValue(v: number | null | undefined, unit?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  let body: string;
  if (abs >= 1_000_000) body = (v / 1_000_000).toFixed(1) + 'M';
  else if (abs >= 1_000) body = (v / 1_000).toFixed(1) + 'k';
  else if (Number.isInteger(v)) body = String(v);
  else if (abs >= 100) body = v.toFixed(0);
  else if (abs >= 10) body = v.toFixed(1);
  else body = v.toFixed(2);
  if (!unit) return body;
  const u = unit.trim();
  if (u === '%') return `${body}%`;
  return `${body} ${u}`;
}
