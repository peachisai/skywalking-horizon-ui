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

import { computed } from 'vue';
import { useQuery } from '@tanstack/vue-query';
import { bffClient } from '@/api/client';
import { useLayers } from './useLayers';

/**
 * Overview-dashboard list driver. Fetches the BFF's bundled list, then
 * filters to dashboards that have at least one referenced layer
 * currently reporting services. Dashboards with no `layers` array are
 * always shown (e.g. a future fleet-glance overview that pulls from
 * everything).
 *
 * The result is partitioned by visibility — `public` overviews are the
 * primary sidebar entries; `operate` overviews are gated to the admin
 * section.
 */
export function useOverviewDashboards() {
  const q = useQuery({
    queryKey: ['overview-dashboards'],
    queryFn: () => bffClient.overviewDashboards(),
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const { availableLayers } = useLayers();
  const activeLayerKeys = computed<Set<string>>(() => {
    const s = new Set<string>();
    for (const L of availableLayers.value) s.add(L.key.toUpperCase());
    return s;
  });

  const all = computed(() => q.data.value?.dashboards ?? []);
  const visible = computed(() =>
    all.value.filter((d) => {
      const layers = d.layers ?? [];
      if (layers.length === 0) return true;
      return layers.some((l) => activeLayerKeys.value.has(l.toUpperCase()));
    }),
  );
  const publicOverviews = computed(() =>
    visible.value.filter((d) => (d.visibility ?? 'public') === 'public'),
  );
  const operateOverviews = computed(() =>
    visible.value.filter((d) => d.visibility === 'operate'),
  );

  return {
    isLoading: q.isLoading,
    isError: q.isError,
    all,
    visible,
    publicOverviews,
    operateOverviews,
  };
}
