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
 * Page-wide selected-service state for the per-layer page. Backed by the
 * URL's `?service=` query parameter so the selection is shareable +
 * survives a full reload. Every tab inside the LayerShell reads via this
 * composable; the LayerServiceSelector at the top of the page is the
 * single writer.
 */

import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';

export function useSelectedService() {
  const route = useRoute();
  const router = useRouter();

  const selectedId = computed<string | null>(() => {
    const v = route.query.service;
    if (typeof v === 'string' && v.length > 0) return v;
    return null;
  });

  /**
   * Update the URL-backed service selection.
   *
   * `opts.keepNarrower` controls whether sibling `?instance=` /
   * `?endpoint=` params survive. Default `false` matches the user
   * clicking a different service in the picker — those narrower picks
   * belong to the OLD service and have to go. Auto-repair callers (the
   * shell's "URL points at a service no longer in the sampled subset"
   * watch) pass `true` so the URL's existing instance/endpoint isn't
   * blown away as a side-effect of a service-side refresh.
   */
  function setSelected(id: string | null, opts: { keepNarrower?: boolean } = {}): void {
    const next = { ...route.query };
    const current = typeof route.query.service === 'string' ? route.query.service : null;
    if (id === current) return;
    if (id) next.service = id;
    else delete next.service;
    if (!opts.keepNarrower) {
      delete next.instance;
      delete next.endpoint;
    }
    // `replace` instead of `push` — switching services shouldn't bloat
    // the browser back stack with N entries.
    void router.replace({ path: route.path, query: next });
  }

  return { selectedId, setSelected };
}
