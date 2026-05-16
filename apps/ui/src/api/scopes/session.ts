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

import type { BffClient, MeResponse } from '../client';

/** `bff.session` — login / logout / current-user fetch. */
export class SessionApi {
  constructor(private readonly bff: BffClient) {}

  login(username: string, password: string): Promise<MeResponse> {
    return this.bff.request<MeResponse>('POST', '/api/auth/login', { username, password });
  }
  logout(): Promise<{ status: 'ok' }> {
    return this.bff.request<{ status: 'ok' }>('POST', '/api/auth/logout');
  }
  me(): Promise<MeResponse> {
    return this.bff.request<MeResponse>('GET', '/api/auth/me');
  }
}
