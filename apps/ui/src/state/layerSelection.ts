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
 * In-memory store for the layer dashboard's current
 * service/instance/endpoint selection.
 *
 * URL contract: the `?service=` / `?instance=` / `?endpoint=` query
 * params are READ ONCE per (layer, scope) entry to seed the store
 * (`hydrateFromQuery`). After that, every selection change — service
 * picker click, instance auto-pick, endpoint picker click — updates
 * THIS STORE ONLY and never touches the URL again. The URL stays
 * frozen at the landing values; it's a shareable starting point, not
 * a live state mirror.
 *
 * Why: a URL-as-state design re-triggered router-level reactivity on
 * every interaction (Vue Router's `route.query` is a hot reactive
 * source many composables observe), making clicks feel sluggish and
 * occasionally fanning out into duplicate fetches. With selection
 * isolated to a store, the only reactivity is the explicit refs
 * downstream watches consume.
 *
 * For sharing the current view, generate a URL from the store on
 * demand (`buildShareUrl()` — to be added when the operator-facing
 * Share button lands). Browser back/forward + reload still works
 * for layer/scope navigation; only the in-page picker state is
 * detached from history.
 */

import { computed } from 'vue';
import { defineStore } from 'pinia';
import { ref } from 'vue';

function pickQueryString(v: unknown): string | null {
  if (typeof v !== 'string' || v.length === 0) return null;
  return v;
}

export const useLayerSelectionStore = defineStore('layer-selection', () => {
  const service = ref<string | null>(null);
  const instance = ref<string | null>(null);
  const endpoint = ref<string | null>(null);
  /** Key of the (layer, scope) the store was last hydrated for —
   *  guards against re-hydration on every render of the same page
   *  and lets `hydrateFromQuery` short-circuit when the caller
   *  passes the same key. */
  const hydratedKey = ref<string | null>(null);

  /**
   * Seed the store from a route's query params, but only when the
   * (layer, scope) differs from what we previously hydrated for.
   * Idempotent — calling repeatedly with the same key is a no-op.
   * Used by LayerShell on mount and on layer/scope changes.
   */
  function hydrateFromQuery(
    layerKey: string,
    scope: string,
    query: Record<string, unknown>,
  ): void {
    const key = `${layerKey}|${scope}`;
    if (hydratedKey.value === key) return;
    hydratedKey.value = key;
    service.value = pickQueryString(query.service);
    instance.value = pickQueryString(query.instance);
    endpoint.value = pickQueryString(query.endpoint);
  }

  /**
   * Service pick. Default semantics drop the narrower picks because
   * the previous instance/endpoint belonged to the OLD service and
   * almost certainly won't exist on the new one. `keepNarrower`
   * preserves them — used by the auto-repair path so a URL-hint
   * survives the first-visit service auto-fill (`current === null`).
   */
  function setService(id: string | null, opts: { keepNarrower?: boolean } = {}): void {
    if (id === service.value) return;
    const current = service.value;
    service.value = id;
    if (current !== null && !opts.keepNarrower) {
      instance.value = null;
      endpoint.value = null;
    }
  }
  function setInstance(name: string | null): void {
    if (name === instance.value) return;
    instance.value = name;
  }
  function setEndpoint(name: string | null): void {
    if (name === endpoint.value) return;
    endpoint.value = name;
  }

  /** Build a shareable URL fragment for the current selection.
   *  Operator-facing Share button (not wired yet) will use this. */
  const shareQuery = computed<string>(() => {
    const parts: string[] = [];
    if (service.value) parts.push(`service=${encodeURIComponent(service.value)}`);
    if (instance.value) parts.push(`instance=${encodeURIComponent(instance.value)}`);
    if (endpoint.value) parts.push(`endpoint=${encodeURIComponent(endpoint.value)}`);
    return parts.length > 0 ? `?${parts.join('&')}` : '';
  });

  return {
    service,
    instance,
    endpoint,
    hydratedKey,
    hydrateFromQuery,
    setService,
    setInstance,
    setEndpoint,
    shareQuery,
  };
});
