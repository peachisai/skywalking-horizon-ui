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
 * Delegated click tracker — surfaces operator clicks in the
 * EventTicker so the timeline reads as a complete "I did X, then
 * the framework did Y" story. Without this the ticker only shows
 * what the framework loaded, never what the operator pressed to
 * trigger the load.
 *
 * Captures `click` events at document.body and emits a `click`
 * event when the target (or an ancestor up to 4 levels) is a
 * recognisable action element — `<button>`, `<a>`, `[role="button"]`,
 * or anything carrying `data-event-click="<label>"` for explicit
 * opt-in.
 *
 * Suppressions:
 *  - Anything inside the EventTicker itself (`.ev-zone`).
 *  - Elements with `data-no-event-track` (sprinkle this on noisy
 *    UI bits — chart tooltips, expand toggles in lists, etc.).
 *  - Form inputs (`<input>`, `<textarea>`, `<select>`).
 *  - Empty-text targets (decorative icon buttons without a label).
 */

import { onBeforeUnmount, onMounted } from 'vue';
import { pushEvent } from '@/controls/eventLog';

const TRACK_SELECTOR =
  'button, a, [role="button"], [data-event-click]';
const SUPPRESS_SELECTOR = '.ev-zone, [data-no-event-track], input, textarea, select';
const MAX_LABEL_LEN = 80;

function describe(el: HTMLElement): string | null {
  const explicit = el.getAttribute('data-event-click');
  if (explicit) return explicit;
  const aria = el.getAttribute('aria-label');
  if (aria && aria.trim()) return aria.trim();
  const text = el.textContent?.replace(/\s+/g, ' ').trim();
  if (text) return text.length > MAX_LABEL_LEN ? text.slice(0, MAX_LABEL_LEN) + '…' : text;
  const title = el.getAttribute('title');
  if (title && title.trim()) return title.trim();
  return null;
}

function findActionTarget(start: HTMLElement | null): HTMLElement | null {
  if (!start) return null;
  // Walk up at most a few levels — the click target is often a
  // child <span> inside the real `<button>`/`<a>` element.
  let el: HTMLElement | null = start;
  for (let i = 0; i < 5 && el; i++) {
    if (el.matches?.(SUPPRESS_SELECTOR)) return null;
    if (el.matches?.(TRACK_SELECTOR)) return el;
    el = el.parentElement;
  }
  return null;
}

function onClick(ev: MouseEvent): void {
  // Skip non-primary clicks (right-click, middle-click open-in-new-tab).
  if (ev.button !== 0) return;
  const target = findActionTarget(ev.target as HTMLElement | null);
  if (!target) return;
  // Re-check the ancestor chain for a suppression marker the loop
  // above might have skipped past (e.g. a `.ev-zone` wrapper higher up).
  if (target.closest(SUPPRESS_SELECTOR)) return;
  const label = describe(target);
  if (!label) return;
  pushEvent('click', 'info', `Clicked: ${label}`);
}

export function useClickTracking(): void {
  onMounted(() => {
    document.body.addEventListener('click', onClick, true);
  });
  onBeforeUnmount(() => {
    document.body.removeEventListener('click', onClick, true);
  });
}
