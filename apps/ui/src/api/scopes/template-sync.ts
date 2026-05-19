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
 * `bff.templateSync` — admin-page surface for the OAP UI-template
 * overlay. The simpler badge-only view used by per-page banners lives
 * inside the bundle (`bff.configs.bundle().syncStatus`); this scope
 * gives the admin pages full-fat rows (bundled + remote configuration
 * strings) for inline diff + adopt/push actions.
 */

import type { BffClient } from '../client';
import type { TemplateKind, TemplateStatus } from './configs';

export interface TemplateSyncRow {
  name: string;
  kind: TemplateKind;
  key: string;
  status: TemplateStatus;
  effective: 'remote' | 'bundled' | null;
  remote: { id: string; configuration: string; disabled: boolean } | null;
  bundled: { configuration: string } | null;
}

export interface TemplateSyncStatus {
  unreachable: boolean;
  lastSuccessfulSyncAt: number | null;
  generatedAt: number;
  rows: TemplateSyncRow[];
}

export class TemplateSyncApi {
  constructor(private readonly bff: BffClient) {}

  /** Full merged status for ALL template kinds. Admin pages filter to
   *  the kind they own. */
  syncStatus(): Promise<TemplateSyncStatus> {
    return this.bff.request<TemplateSyncStatus>('GET', '/api/admin/templates/sync-status');
  }

  /** Force the BFF to invalidate its 30s cache + refetch from OAP. */
  resync(): Promise<TemplateSyncStatus> {
    return this.bff.request<TemplateSyncStatus>('POST', '/api/admin/templates/resync');
  }

  /** Save a template's content to OAP. The BFF wraps it in the canonical
   *  envelope. 409 when OAP is unreachable — the page banner should have
   *  prevented the call, but server-side guard catches operator scripts. */
  save(name: string, content: unknown): Promise<TemplateSyncStatus> {
    return this.bff.request<TemplateSyncStatus>('POST', '/api/admin/templates/save', {
      name,
      content,
    });
  }

  /** Operator wants the bundled JSON to overwrite whatever OAP has for
   *  this name. Used for "adopt my code defaults" from the diff view. */
  pushBundled(name: string): Promise<TemplateSyncStatus> {
    return this.bff.request<TemplateSyncStatus>(
      'POST',
      `/api/admin/templates/${encodeURIComponent(name)}/push-bundled`,
    );
  }
}
