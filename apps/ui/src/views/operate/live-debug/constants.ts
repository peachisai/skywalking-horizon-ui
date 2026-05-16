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
 * Shared knobs for the three live-debugger views (MAL / LAL / OAL).
 * Single source of truth for unit conversions and view defaults.
 * Wire-level caps (`MAX_RECORD_CAP`, `MAX_RETENTION_MILLIS`) live in
 * `@skywalking-horizon-ui/api-client` so the BFF + UI agree on the contract
 * value; we re-export `RECORD_CAP_MAX` here as the value the views
 * use for both input bounds and the recordCap default.
 */

import { MAX_RECORD_CAP } from '@skywalking-horizon-ui/api-client';

/** Mirror of the wire's `MAX_RECORD_CAP` — used as both default and
 *  upper bound on the per-DSL `recordCap` input. */
export const RECORD_CAP_MAX = MAX_RECORD_CAP;

/** Default capture-window length in minutes. OAP's hard cap is 60. */
export const DEFAULT_RETENTION_MINUTES = 5;

/** Convenience for retentionMinutes ↔ retentionMillis conversion. */
export const MS_PER_MINUTE = 60_000;
