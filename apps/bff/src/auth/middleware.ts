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
 * Per-request auth + RBAC pre-handlers. Pluggable into any Fastify
 * route via `{ preHandler: [requireAuth(deps), requireVerb(deps, 'rule:read')] }`.
 *
 * Two-step shape (require-auth, then require-verb) keeps the verb name
 * visible at the route declaration site.
 */

import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ConfigSource } from '../config/loader.js';
import { sessionHasVerb } from '../rbac/policy.js';
import type { Session, SessionStore } from './sessions.js';

declare module 'fastify' {
  interface FastifyRequest {
    session?: Session;
  }
}

export interface AuthDeps {
  config: ConfigSource;
  sessions: SessionStore;
}

export function requireAuth(deps: AuthDeps) {
  return async function authPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const cookieName = deps.config.current_().session.cookieName;
    const sid = req.cookies?.[cookieName];
    if (!sid) {
      return void reply.code(401).send({ error: 'unauthenticated' });
    }
    const session = deps.sessions.get(sid);
    if (!session) {
      return void reply.code(401).send({ error: 'unauthenticated' });
    }
    req.session = session;
  };
}

export function requireVerb(deps: AuthDeps, verb: string) {
  return async function verbPreHandler(req: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = req.session;
    if (!session) {
      return void reply.code(401).send({ error: 'unauthenticated' });
    }
    if (!sessionHasVerb(deps.config.current_(), session.roles, verb)) {
      return void reply.code(403).send({ error: 'permission_denied', verb });
    }
  };
}
