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

/**
 * Page-loading event log — a single shared store of "what the framework
 * is doing right now". Composables (data loaders, route guards,
 * widgets) push events; the topbar's EventTicker reads them and shows
 * the latest line plus an expandable history.
 *
 * Each event carries a `topic` (the unit of work — `"services"`,
 * `"dashboard"`, …) so paired start/end events are matched on the
 * topic and the ticker can de-duplicate (a refetch on the same topic
 * replaces the prior open entry rather than stacking up forever).
 *
 * No Pinia dep on purpose — the store is a tiny module-scoped ref +
 * helpers so composables can `pushEvent(...)` without paying the
 * pinia ceremony for a glorified queue.
 */
import { computed, ref, type ComputedRef, type Ref } from 'vue';

export type EventKind = 'start' | 'ok' | 'err' | 'info';
export interface FrameworkEvent {
  /** Monotonic id — lets the UI key v-for stably + diff highlights. */
  id: number;
  /** Logical work unit, e.g. `"services"`, `"instances"`, `"dashboard"`. */
  topic: string;
  /** Severity / phase. `start` is the "doing X…" line; the matching
   *  `ok` / `err` resolves it. `info` is a fire-and-forget note. */
  kind: EventKind;
  /** Display text — kept short, suitable for a one-line ticker. */
  text: string;
  /** Wall-clock for the history pop-over. */
  ts: number;
  /** Optional duration (ms) — set on `ok`/`err` when there was a
   *  matching `start`; the ticker shows it as `· 123ms`. */
  durationMs?: number;
}

const HISTORY_CAP = 200;
const events = ref<FrameworkEvent[]>([]);
let nextId = 1;
/** Open `start` events keyed by topic — used to compute duration when
 *  the matching `ok` / `err` arrives, and to dedupe repeated starts
 *  on the same topic (a Vue Query refetch shouldn't stack a new
 *  "Loading services…" each tick). */
const openStarts = new Map<string, FrameworkEvent>();

function append(ev: FrameworkEvent): void {
  events.value = [...events.value, ev].slice(-HISTORY_CAP);
}

/**
 * Push a new event. Convenience signature: `pushEvent(topic, kind, text)`.
 * For `start` the topic is recorded so the later `ok`/`err` on the same
 * topic can compute duration. For repeated `start`s on the same topic
 * the previous open entry is dropped from the visible log — the new
 * one supersedes it.
 */
export function pushEvent(topic: string, kind: EventKind, text: string): void {
  if (kind === 'start') {
    const prior = openStarts.get(topic);
    if (prior) {
      events.value = events.value.filter((e) => e.id !== prior.id);
    }
    const ev: FrameworkEvent = { id: nextId++, topic, kind, text, ts: Date.now() };
    openStarts.set(topic, ev);
    append(ev);
    return;
  }
  if (kind === 'ok' || kind === 'err') {
    const open = openStarts.get(topic);
    const durationMs = open ? Date.now() - open.ts : undefined;
    openStarts.delete(topic);
    const ev: FrameworkEvent = { id: nextId++, topic, kind, text, ts: Date.now(), durationMs };
    append(ev);
    return;
  }
  append({ id: nextId++, topic, kind, text, ts: Date.now() });
}

/** Drop every recorded event — call on route navigation so the
 *  ticker doesn't show stale events from the previous page. */
export function resetEventLog(): void {
  events.value = [];
  openStarts.clear();
}

/**
 * Read-only handle for components. `latest` is the head of the queue
 * (the most recent event — what the ticker shows) and `all` is the
 * full bounded history for the expand pop-over.
 */
export function useEventLog(): {
  all: Ref<FrameworkEvent[]>;
  latest: ComputedRef<FrameworkEvent | null>;
} {
  return {
    all: events,
    latest: computed<FrameworkEvent | null>(() =>
      events.value.length > 0 ? events.value[events.value.length - 1] : null,
    ),
  };
}
