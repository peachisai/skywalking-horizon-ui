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
import type { PreflightResult } from '@skywalking-horizon-ui/api-client';
import { bffClient } from '@/api/client';
import { useAutoRefreshSubscribe } from './useAutoRefreshSubscribe';

/**
 * Admin-port preflight — interrogates OAP's `/debugging/config/dump`
 * (port 17128 by default) and exposes per-module enablement plus a
 * shorthand `adminReachable` flag. Drives:
 *   - the admin section of `/operate/cluster`
 *   - the per-page warning header on admin-host routes (DSL Mgmt,
 *     Live Debugger, Dump, OAL viewer, Inspect)
 *
 * The graphql-port (`:12800`) reachability lives in `useOapInfo` —
 * keeping the two checks split lets the cluster page show "graphql
 * fine, admin down" without false negatives on either side.
 *
 * Polled every 60s; the cluster page can call `refetch()` to poke
 * it on demand after the operator fixes the network / selectors.
 */
export function useAdminFeatures() {
  const q = useQuery({
    queryKey: ['oap-preflight'],
    queryFn: () => bffClient.menu.preflight(),
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });

  useAutoRefreshSubscribe(() => q.refetch());

  const result = computed<PreflightResult | null>(() => q.data.value ?? null);
  const adminReachable = computed<boolean>(() => result.value?.adminReachable ?? false);
  const adminUrl = computed<string | undefined>(() => result.value?.adminUrl);
  const adminError = computed<string | undefined>(() => result.value?.adminError);

  /** Look up a single module by OAP name (e.g. `receiver-runtime-rule`). */
  function moduleByName(name: string) {
    return computed(() => result.value?.modules.find((m) => m.name === name));
  }

  const runtimeRuleEnabled = computed<boolean>(
    () => moduleByName('receiver-runtime-rule').value?.enabled ?? false,
  );
  const dslDebuggingEnabled = computed<boolean>(
    () => moduleByName('dsl-debugging').value?.enabled ?? false,
  );
  const inspectEnabled = computed<boolean>(
    () => moduleByName('inspect').value?.enabled ?? false,
  );

  /** Convenience for the per-page warning header — true when nothing
   *  on the admin port works (port itself down OR admin-server module
   *  off). Page UIs render the warning + still try to mount so the
   *  empty-state messaging stays consistent. */
  const adminUnavailable = computed<boolean>(
    () => !result.value || !adminReachable.value,
  );

  return {
    isLoading: q.isLoading,
    result,
    adminUrl,
    adminReachable,
    adminUnavailable,
    adminError,
    runtimeRuleEnabled,
    dslDebuggingEnabled,
    inspectEnabled,
    moduleByName,
    refetch: q.refetch,
  };
}
