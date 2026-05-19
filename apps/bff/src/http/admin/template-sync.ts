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
 * Template sync surface for the admin pages.
 *
 *   GET  /api/admin/templates/sync-status           — full merged map
 *                                                     (bundled + remote +
 *                                                     status per name).
 *                                                     Pages render banners
 *                                                     and per-row diffs
 *                                                     from this body.
 *
 *   POST /api/admin/templates/:name/push-bundled    — operator wants the
 *                                                     bundled copy of this
 *                                                     template to overwrite
 *                                                     what OAP has. 409 if
 *                                                     OAP unreachable;
 *                                                     forces a resync on
 *                                                     success.
 *
 *   POST /api/admin/templates/save                  — write a template
 *                                                     (Save in the admin
 *                                                     UI). Body: { name,
 *                                                     content }. PUTs the
 *                                                     envelope to OAP. 409
 *                                                     when OAP unreachable
 *                                                     (the UI banner should
 *                                                     have prevented this
 *                                                     call, but verify
 *                                                     server-side).
 *
 *   POST /api/admin/templates/resync                — invalidate the 30s
 *                                                     cache; the next
 *                                                     bundle pull triggers
 *                                                     a fresh OAP probe.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { UITemplateClient } from '@skywalking-horizon-ui/api-client';
import type { ConfigSource } from '../../config/loader.js';
import type { SessionStore } from '../../user/sessions.js';
import { requireAuth } from '../../user/middleware.js';
import {
  getSyncStatus,
  resync,
  type SyncStatus,
} from '../../logic/templates/sync.js';
import { iterateBundledTemplates } from '../../logic/templates/aggregator.js';
import {
  buildEnvelope,
  parseName,
  serializeEnvelope,
  type TemplateKind,
} from '../../logic/templates/names.js';
import { logger } from '../../logger.js';

export interface TemplateSyncAdminDeps {
  config: ConfigSource;
  sessions: SessionStore;
  uiTemplateClient: () => UITemplateClient;
}

export function registerTemplateSyncAdminRoutes(
  app: FastifyInstance,
  deps: TemplateSyncAdminDeps,
): void {
  const auth = requireAuth(deps);

  app.get(
    '/api/admin/templates/sync-status',
    { preHandler: auth },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const status = await loadStatus(deps);
      return reply.send(status);
    },
  );

  app.post(
    '/api/admin/templates/resync',
    { preHandler: auth },
    async (_req: FastifyRequest, reply: FastifyReply) => {
      resync();
      const status = await loadStatus(deps);
      return reply.send(status);
    },
  );

  app.post<{
    Params: { name: string };
  }>(
    '/api/admin/templates/:name/push-bundled',
    { preHandler: auth },
    async (req, reply) => {
      const { name } = req.params;
      const parsed = parseName(name);
      if (!parsed) {
        return reply.code(400).send({
          code: 'invalid_template_name',
          message: `expected horizon.<overview|layer|alert>.<key>, got ${JSON.stringify(name)}`,
        });
      }
      const status = await loadStatus(deps);
      if (status.unreachable) {
        return reply.code(409).send({
          code: 'oap_unreachable',
          message: 'OAP admin port unreachable — templates are read-only',
        });
      }
      const row = status.rows.find((r) => r.name === name);
      if (!row?.bundled) {
        return reply.code(404).send({
          code: 'no_bundled',
          message: `no bundled template for ${name} — nothing to push`,
        });
      }
      try {
        if (row.remote) {
          await deps.uiTemplateClient().update(row.remote.id, row.bundled.configuration);
        } else {
          await deps.uiTemplateClient().create(row.bundled.configuration);
        }
        resync();
        const fresh = await loadStatus(deps);
        return reply.send(fresh);
      } catch (err) {
        logger.warn({ err: errMsg(err), name }, 'push-bundled to OAP failed');
        return reply.code(502).send({
          code: 'oap_write_failed',
          message: errMsg(err),
        });
      }
    },
  );

  app.post<{
    Body: {
      name?: string;
      content?: unknown;
    };
  }>('/api/admin/templates/save', { preHandler: auth }, async (req, reply) => {
    const { name, content } = req.body ?? {};
    if (typeof name !== 'string' || content === undefined) {
      return reply.code(400).send({
        code: 'invalid_save_body',
        message: 'body must be { name: string, content: object }',
      });
    }
    const parsed = parseName(name);
    if (!parsed) {
      return reply.code(400).send({
        code: 'invalid_template_name',
        message: `expected horizon.<overview|layer|alert>.<key>, got ${JSON.stringify(name)}`,
      });
    }
    const status = await loadStatus(deps);
    if (status.unreachable) {
      return reply.code(409).send({
        code: 'oap_unreachable',
        message: 'OAP admin port unreachable — templates are read-only',
      });
    }
    const envelope = buildEnvelope(parsed.kind as TemplateKind, parsed.key, content);
    const configuration = serializeEnvelope(envelope);
    const existing = status.rows.find((r) => r.name === name);
    try {
      if (existing?.remote) {
        await deps.uiTemplateClient().update(existing.remote.id, configuration);
      } else {
        await deps.uiTemplateClient().create(configuration);
      }
      resync();
      const fresh = await loadStatus(deps);
      return reply.send(fresh);
    } catch (err) {
      logger.warn({ err: errMsg(err), name }, 'save to OAP failed');
      return reply.code(502).send({
        code: 'oap_write_failed',
        message: errMsg(err),
      });
    }
  });
}

async function loadStatus(deps: TemplateSyncAdminDeps): Promise<SyncStatus> {
  return getSyncStatus({
    client: deps.uiTemplateClient(),
    bundled: () => iterateBundledTemplates(),
    logger,
  });
}

function errMsg(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
