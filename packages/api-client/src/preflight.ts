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
 * Wire shape for `GET /api/preflight` — interrogates OAP admin's
 * `/debugging/config/dump` and reports which OAP modules / SWIP-13
 * selectors are enabled. Drives the admin-port section of the
 * Cluster Status page and the per-page warning headers on admin-host
 * routes (DSL Management, Live Debugger, Dump, OAL viewer, Inspect).
 *
 * `adminReachable === false` means the admin host itself is down
 * (network, port not exposed, OAP not started); every module is
 * reported `enabled: false` regardless of selector config. The
 * operator's first move in that case is to fix the network / port
 * exposure, not to flip selectors on.
 */

export interface PreflightModule {
  /** OAP module name as it appears in the config-dump key prefix. */
  name: string;
  /** The env var that toggles this module's selector on OAP. */
  envVar: string;
  /** True when horizon depends on this module being on. */
  required: boolean;
  /** True iff the dump carries at least one key with this module's prefix. */
  enabled: boolean;
  /** What part of horizon breaks when this module is off. */
  affects: string;
}

export interface PreflightResult {
  adminUrl: string;
  /** True iff `/debugging/config/dump` responded 2xx. */
  adminReachable: boolean;
  /** Short reason when `adminReachable` is false. */
  adminError?: string;
  modules: PreflightModule[];
  /** Total keys in the dump. Diagnostic only. */
  dumpKeyCount: number;
  generatedAt: number;
}
