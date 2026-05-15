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

import { z } from 'zod';

const serverSchema = z
  .object({
    host: z.string().default('127.0.0.1'),
    port: z.number().int().positive().default(8081),
    staticDir: z.string().optional(),
  })
  .strict();

const oapSchema = z
  .object({
    // The OAP admin host. Default 17128 per the upstream Armeria binding.
    adminUrls: z.array(z.string().url()).default(['http://127.0.0.1:17128']),
    // The OAP query/status host (GraphQL + /status/*).
    statusUrl: z.string().url().default('http://127.0.0.1:12800'),
    timeoutMs: z.number().int().positive().default(15000),
    // Optional basic-auth credentials sent on every outbound OAP call
    // (GraphQL, /status, /api/v2/* for Zipkin). The public demo host
    // (`demo.skywalking.apache.org`) gates calls behind
    // skywalking:skywalking — set both fields to use it.
    auth: z
      .object({
        username: z.string().min(1),
        password: z.string().min(1),
      })
      .strict()
      .optional(),
    mqe: z
      .object({
        host: z.string().optional(),
        port: z.number().int().positive().optional(),
      })
      .strict()
      .default({}),
    // OAP's Zipkin REST endpoint (the `ZipkinQueryHandler`). Defaults
    // to `<statusUrl-host>:9412/zipkin` per the upstream Armeria
    // binding, but operators commonly proxy it under the same host as
    // GraphQL (`<host>/zipkin/...`). Set explicitly when the demo /
    // production OAP serves Zipkin from a non-standard origin. Used
    // by the Zipkin trace viewer for mesh / k8s layers whose traces
    // flow as Zipkin-format spans (Envoy ALS, rover).
    zipkinUrl: z.string().url().default('http://127.0.0.1:9412/zipkin'),
  })
  .strict();

const localUserSchema = z
  .object({
    username: z.string().min(1),
    passwordHash: z.string().min(1),
    roles: z.array(z.string().min(1)).default([]),
  })
  .strict();

const authSchema = z
  .object({
    backend: z.literal('local').default('local'),
    local: z
      .object({
        users: z.array(localUserSchema).default([]),
      })
      .strict()
      .default({ users: [] }),
  })
  .strict()
  .default({ backend: 'local', local: { users: [] } });

const rbacSchema = z
  .object({
    enabled: z.boolean().default(false),
    roles: z
      .record(z.string(), z.array(z.string().min(1)))
      .default({
        viewer: ['*:read'],
        editor: ['*:read', 'rule:write', 'rule:debug', 'inspect:read'],
        admin: ['*'],
      }),
  })
  .strict()
  .default({ enabled: false, roles: {} });

const sessionSchema = z
  .object({
    ttlMinutes: z.number().int().positive().default(60),
    cookieName: z.string().default('horizon_sid'),
    cookieSecure: z.boolean().default(false),
  })
  .strict()
  .default({ ttlMinutes: 60, cookieName: 'horizon_sid', cookieSecure: false });

const auditSchema = z
  .object({
    file: z.string().default('./horizon-audit.jsonl'),
  })
  .strict()
  .default({ file: './horizon-audit.jsonl' });

const setupSchema = z
  .object({
    file: z.string().default('./horizon-setup.json'),
  })
  .strict()
  .default({ file: './horizon-setup.json' });

const debugLogSchema = z
  .object({
    enabled: z.boolean().default(false),
    file: z.string().default('./horizon-wire.jsonl'),
    maxBodyChars: z.number().int().nonnegative().default(8192),
    redactAuthHeaders: z.boolean().default(true),
  })
  .strict()
  .default({
    enabled: false,
    file: './horizon-wire.jsonl',
    maxBodyChars: 8192,
    redactAuthHeaders: true,
  });

export const configSchema = z
  .object({
    server: serverSchema.default({}),
    oap: oapSchema.default({}),
    auth: authSchema,
    rbac: rbacSchema,
    session: sessionSchema,
    audit: auditSchema,
    setup: setupSchema,
    debugLog: debugLogSchema,
  })
  .strict();

export type HorizonConfig = z.infer<typeof configSchema>;
