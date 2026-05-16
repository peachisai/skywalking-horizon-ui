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

import type {
  AlarmsConfig,
  AlarmsQuery,
  AlarmsResponse,
  AlarmTrafficResponse,
  BffClient,
} from '../client';

/** `bff.alarms` — alarm list + per-layer traffic backdrop + alarm-page
 *  config CRUD. */
export class AlarmsApi {
  constructor(private readonly bff: BffClient) {}

  list(q: AlarmsQuery): Promise<AlarmsResponse> {
    const p = new URLSearchParams({
      startTime: String(q.startTime),
      endTime: String(q.endTime),
      pageNum: String(q.pageNum ?? 1),
      pageSize: String(q.pageSize ?? 100),
    });
    if (q.scope) p.set('scope', q.scope);
    if (q.keyword) p.set('keyword', q.keyword);
    if (q.service) p.set('service', q.service);
    if (q.instance) p.set('instance', q.instance);
    if (q.endpoint) p.set('endpoint', q.endpoint);
    return this.bff.request<AlarmsResponse>('GET', `/api/alarms?${p.toString()}`);
  }

  traffic(startTime: number, endTime: number): Promise<AlarmTrafficResponse> {
    const p = new URLSearchParams({ startTime: String(startTime), endTime: String(endTime) });
    return this.bff.request<AlarmTrafficResponse>('GET', `/api/alarms/traffic?${p.toString()}`);
  }

  /** Service roster for one OAP layer (alpha-sorted) — feeds the
   *  alarms page's cascading filter. */
  services(layer: string): Promise<{
    layer: string;
    services: Array<{ name: string; normal: boolean | null }>;
  }> {
    const p = new URLSearchParams({ layer });
    return this.bff.request('GET', `/api/alarms/services?${p.toString()}`);
  }

  config(): Promise<AlarmsConfig> {
    return this.bff.request<AlarmsConfig>('GET', '/api/alarms/config');
  }

  saveConfig(next: AlarmsConfig): Promise<AlarmsConfig> {
    return this.bff.request<AlarmsConfig>('POST', '/api/alarms/config', next);
  }
}
