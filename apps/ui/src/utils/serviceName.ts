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

import type { ServiceNamingRule } from '@skywalking-horizon-ui/api-client';

/**
 * Service-name parsing. Two flavours coexist:
 *
 *   - Legacy `<group>::<base>` (OAP's historical encoding for fleet /
 *     deployment prefix) — used by general-purpose layers like
 *     `agent::songs`.
 *   - Per-layer `ServiceNamingRule` (named-capture regex) — used by
 *     k8s / mesh / cilium layers where the encoded grouping dimension
 *     is the namespace (`songs.sample` → `songs` + namespace `sample`).
 *
 * Rendering rule applied across the UI:
 *   - Service lists / pickers / KPI strips → render `<alias-chip> <display>`
 *     so the grouping reads as a category tag and the eye lands on the
 *     service label.
 *   - Topology nodes → render `display` only; alias-chip lives in
 *     the right-sidebar detail panel and the group bounding box title.
 *
 * The two parsers are intentionally separate: legacy `::` is layer-
 * agnostic and always available; the rule-based parser only fires
 * when a layer config carries an explicit `naming` rule.
 */
export interface ParsedServiceName {
  /** Group prefix when the raw name contains `::`. */
  group: string | null;
  /** Service name with the `<group>::` prefix stripped; equal to `raw`
   *  when there is no group. */
  base: string;
  /** Original full name (echoed so callers don't have to keep it around). */
  raw: string;
}

export function parseServiceName(raw: string | null | undefined): ParsedServiceName {
  const r = raw ?? '';
  const idx = r.indexOf('::');
  if (idx <= 0) return { group: null, base: r, raw: r };
  return { group: r.slice(0, idx), base: r.slice(idx + 2), raw: r };
}

/** Display helper — base only. Use in tight spots (graph nodes, chips). */
export function serviceBaseName(raw: string | null | undefined): string {
  return parseServiceName(raw).base;
}

/** Display helper — group only (null when no group). Renderers should
 *  treat null as "no group chip". */
export function serviceGroupName(raw: string | null | undefined): string | null {
  return parseServiceName(raw).group;
}

/**
 * Per-layer identity resolution. Given a service name and the layer's
 * `ServiceNamingRule` (if any), returns the trio every UI surface
 * needs:
 *
 *   - `display`  the label shown next to the node / on the chip / in
 *                lists. Always non-empty (falls back to the raw name).
 *   - `group`    the value used for clustering (e.g. namespace name).
 *                `null` when no grouping applies — UI hides the chip.
 *   - `alias`    human label for the dimension (e.g. `namespace`,
 *                `group`). `null` when `group` is null; otherwise
 *                non-empty. Surfaced as the chip prefix (`namespace ·
 *                sample`) and the group-box title.
 *
 * Resolution order:
 *   1. If `rule` is non-null and its regex matches, use the captured
 *      groups + rule.alias.
 *   2. Else if the name contains `::`, treat it as legacy group/base
 *      with alias `group`.
 *   3. Else: display=raw, group=null, alias=null.
 */
export interface ServiceIdentity {
  display: string;
  group: string | null;
  alias: string | null;
}

/**
 * Compile a `ServiceNamingRule` into a memoisable RegExp.
 *
 * Returns `null` when the pattern is invalid — callers fall through to
 * the legacy `::` parser. Pattern compilation errors are swallowed by
 * design; mis-typed regexes in operator-edited config should never
 * crash the topology view, just behave as if no rule was configured.
 */
function compileRule(rule: ServiceNamingRule | null | undefined): RegExp | null {
  if (!rule || !rule.pattern) return null;
  try {
    return new RegExp(rule.pattern, rule.flags ?? '');
  } catch {
    return null;
  }
}

export function resolveServiceIdentity(
  raw: string | null | undefined,
  rule: ServiceNamingRule | null | undefined,
): ServiceIdentity {
  const r = raw ?? '';
  // Rule-based parse first — layer config wins when present and the
  // pattern actually matches the name.
  const re = compileRule(rule);
  if (re && rule) {
    const m = r.match(re);
    if (m && m.groups) {
      const displayKey = rule.displayGroup ?? 'service';
      const valueKey = rule.valueGroup ?? 'group';
      const display = m.groups[displayKey];
      const group = m.groups[valueKey];
      // Only honour the rule when BOTH expected captures resolved to
      // non-empty strings. Partial matches (e.g. one capture missing)
      // fall through to the legacy parser so the operator's bad
      // pattern doesn't strip half the data.
      if (display && group) {
        return { display, group, alias: rule.alias };
      }
      if (display) {
        return { display, group: null, alias: null };
      }
    }
  }
  // Legacy `<group>::<base>` fallback.
  const legacy = parseServiceName(r);
  if (legacy.group) {
    return { display: legacy.base, group: legacy.group, alias: 'group' };
  }
  return { display: r, group: null, alias: null };
}
