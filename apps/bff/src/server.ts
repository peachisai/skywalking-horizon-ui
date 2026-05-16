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

import { existsSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import fastifyStatic from '@fastify/static';
import { AuditLogger } from './audit/logger.js';
import { registerAuthRoutes } from './auth/routes.js';
import { SessionStore } from './auth/sessions.js';
import { loadConfig, type ConfigSource } from './config/loader.js';
import { registerDashboardRoute } from './dashboard/routes.js';
import { registerEndpointRoute } from './oap/endpoint-routes.js';
import { registerEndpointDependencyRoute } from './oap/endpoint-dependency-routes.js';
import { registerOapInfoRoute } from './oap/info-routes.js';
import { registerInstanceRoute } from './oap/instance-routes.js';
import { registerLandingRoute } from './oap/landing-routes.js';
import { registerLogRoute } from './oap/log-routes.js';
import { registerMenuRoute } from './oap/menu-routes.js';
import { registerOapRoutes } from './oap/routes.js';
import { registerPreflightRoutes } from './oap/preflight-routes.js';
import { registerDebugRoutes } from './oap/debug-routes.js';
import { registerInspectRoutes } from './oap/inspect-routes.js';
import { registerAlarmsRoutes } from './alarms/routes.js';
import { AlarmsStore } from './alarms/store.js';
import { registerProfileRoutes } from './oap/profile-routes.js';
import { registerEBPFRoutes } from './oap/ebpf-routes.js';
import { registerAsyncProfileRoutes } from './oap/async-profile-routes.js';
import { registerTopologyRoute } from './oap/topology-routes.js';
import { registerTraceRoutes } from './oap/trace-routes.js';
import { registerTraceTagRoutes } from './oap/trace-tag-routes.js';
import { registerZipkinRoutes } from './oap/zipkin-routes.js';
import { registerOverviewRoutes } from './overview/routes.js';
import { registerSetupRoutes } from './setup/routes.js';
import { SetupStore } from './setup/store.js';
import { HttpError } from './errors.js';
import { logger, loggerOptions } from './logger.js';

const configPath = process.env.HORIZON_CONFIG ?? './horizon.yaml';

const source: ConfigSource = loadConfig(configPath);
logger.info({ configPath: source.path }, 'config loaded');
source.onChange((cfg) => logger.info({ users: cfg.auth.local.users.length }, 'config reloaded'));

const app = Fastify({ logger: loggerOptions });

app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) {
    return reply.status(err.statusCode).send({ code: err.code, message: err.message, details: err.details });
  }
  const message = err instanceof Error ? err.message : 'internal error';
  reply.log.error({ err }, 'unhandled');
  return reply.status(500).send({ code: 'internal_error', message });
});

const sessions = new SessionStore({ ttlMinutes: source.current.session.ttlMinutes });
const audit = new AuditLogger(source.current.audit.file);
await audit.open();
const setupStore = new SetupStore(source.current.setup.file);
await setupStore.load();
const alarmsStore = new AlarmsStore(source.current.alarms.file);
await alarmsStore.load();

await app.register(cookie);

// Text/plain body parser — the rule editor sends raw YAML to /api/rule.
app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => done(null, body));

registerAuthRoutes(app, source, sessions, audit);
registerOapInfoRoute(app, { config: source, sessions });
registerMenuRoute(app, { config: source, sessions });
registerLandingRoute(app, { config: source, sessions });
registerInstanceRoute(app, { config: source, sessions });
registerEndpointRoute(app, { config: source, sessions });
registerTopologyRoute(app, { config: source, sessions });
registerEndpointDependencyRoute(app, { config: source, sessions });
registerTraceRoutes(app, { config: source, sessions });
registerTraceTagRoutes(app, { config: source, sessions });
registerZipkinRoutes(app, { config: source, sessions });
registerLogRoute(app, { config: source, sessions });
registerOverviewRoutes(app, { config: source, sessions });
registerDashboardRoute(app, { config: source, sessions });
registerSetupRoutes(app, { config: source, sessions, audit, store: setupStore });
registerOapRoutes(app, { config: source, sessions, audit });
registerPreflightRoutes(app, { config: source, sessions });
// Live debugger — `/api/debug/*` proxies for SWIP-13's
// `/dsl-debugging/*` wire (start / poll / stop session, list active
// sessions, per-node status fan-out).
registerDebugRoutes(app, { config: source, sessions, audit });
// Inspect — OAP metric catalog browse + MQE ad-hoc execution.
registerInspectRoutes(app, { config: source, sessions, audit });
// Alarms — getAlarm proxy + traffic-background fan-out + config CRUD.
registerAlarmsRoutes(app, { config: source, sessions, audit, store: alarmsStore });
registerProfileRoutes(app, { config: source, sessions });
registerEBPFRoutes(app, { config: source, sessions });
registerAsyncProfileRoutes(app, { config: source, sessions });

// Serve the built SPA out of the BFF when HORIZON_STATIC_DIR points at a
// directory (Docker image layout: /app/static contains the Vite dist).
// Local dev keeps using the Vite dev-server on :9091 so this is a no-op
// when the env var is absent.
const staticDir = process.env.HORIZON_STATIC_DIR
  ? resolvePath(process.env.HORIZON_STATIC_DIR)
  : null;
if (staticDir && existsSync(staticDir)) {
  await app.register(fastifyStatic, { root: staticDir, prefix: '/', wildcard: false });
  // SPA fallback — anything that isn't an `/api/*` request and didn't match
  // a built file falls through to index.html so client-side routing works.
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.code(404).send({ code: 'not_found', message: req.url });
    }
    return reply.sendFile('index.html');
  });
  logger.info({ staticDir }, 'serving SPA from static dir');
}

app.get('/api/health', async () => ({
  status: 'ok',
  version: process.env.HORIZON_VERSION ?? '0.1.0',
  sessions: sessions.size(),
}));

const { host, port } = source.current.server;
app.listen({ host, port }).then(
  () => logger.info(`BFF listening on http://${host}:${port}`),
  (err) => {
    logger.fatal({ err }, 'failed to start BFF');
    process.exit(1);
  },
);

async function shutdown(signal: string) {
  logger.info({ signal }, 'shutting down');
  await app.close();
  await sessions.close();
  await audit.close();
  await source.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
