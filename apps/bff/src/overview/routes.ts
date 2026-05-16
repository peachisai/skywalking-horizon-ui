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
 * Overview-dashboard routes.
 *
 *   GET  /api/overview/dashboards            — list (id, title, count).
 *   GET  /api/overview/dashboards/:id        — full dashboard config.
 *
 * Widget DATA is fetched by the SPA on a per-widget basis through
 * existing routes — service-count + topology hit
 * `/api/layer/:key/landing` and `/api/layer/:key/topology` directly,
 * and `metric` widgets evaluate their MQE through the dashboard data
 * route. Keeping the overview route lean (config only) lets the SPA
 * mix and match — e.g. a "Mesh service" dashboard widget reusing
 * the same topology endpoint that the per-layer page hits.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type {
  OverviewDashboardListResponse,
  OverviewDashboardResponse,
} from '@skywalking-horizon-ui/api-client';
import type { ConfigSource } from '../config/loader.js';
import type { SessionStore } from '../auth/sessions.js';
import { requireAuth } from '../auth/middleware.js';
import { getOverviewDashboard, loadOverviewDashboards } from './loader.js';

export interface OverviewRouteDeps {
  config: ConfigSource;
  sessions: SessionStore;
}

export function registerOverviewRoutes(app: FastifyInstance, deps: OverviewRouteDeps): void {
  const auth = requireAuth(deps);

  app.get('/api/overview/dashboards', { preHandler: auth }, async (_req, reply) => {
    const dashboards = loadOverviewDashboards();
    const body: OverviewDashboardListResponse = {
      generatedAt: Date.now(),
      dashboards: dashboards.map((d) => ({
        id: d.id,
        title: d.title,
        description: d.description,
        visibility: d.visibility,
        icon: d.icon,
        order: d.order,
        layers: d.layers,
        widgetCount: d.widgets.length,
      })),
    };
    return reply.send(body);
  });

  app.get(
    '/api/overview/dashboards/:id',
    { preHandler: auth },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const dash = getOverviewDashboard(id);
      if (!dash) {
        const body: OverviewDashboardResponse = {
          generatedAt: Date.now(),
          dashboard: { id, title: id, widgets: [] },
          reachable: false,
          error: `unknown dashboard "${id}"`,
        };
        return reply.code(404).send(body);
      }
      const body: OverviewDashboardResponse = {
        generatedAt: Date.now(),
        dashboard: dash,
        reachable: true,
      };
      return reply.send(body);
    },
  );
}
