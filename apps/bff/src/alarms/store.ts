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
 * File-backed store for the Alarms-page setup. Holds the list of OAP
 * layers whose RPM traffic is rendered as the background series on
 * the alarms timeline, with the MQE expression to fire per layer.
 *
 * Defaults (when no override file exists) seed agent + mesh so a
 * fresh install shows traffic out-of-the-box. Operators add / remove
 * layers and tune the MQE via the Alert Page Setup admin view.
 *
 * Storage convention mirrors `SetupStore`: tolerant of `{layers:...}`
 * envelope OR bare object; serialised writes with a `.tmp` rename so
 * the file never appears half-written to a watcher.
 */

import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { logger } from '../logger.js';

/** One background-traffic series the alarms timeline renders. */
export interface AlarmTrafficLayer {
  /** OAP layer key in canonical form — `GENERAL`, `MESH`, `K8S`,
   *  `MESH_DP`, etc. Used both as the entity scope's layer filter and
   *  the display label fallback. */
  layerKey: string;
  /** MQE expression to fire for this layer. Must yield a per-service
   *  labeled time-series; the BFF sums across services to produce a
   *  single layer-aggregate line. */
  mqe: string;
  /** Optional display label override. If absent the BFF derives it
   *  from the layer's canonical name. */
  label?: string;
}

export interface AlarmsConfig {
  trafficLayers: AlarmTrafficLayer[];
}

/* Default seed — agent (`GENERAL` in OAP) + Istio data plane (`MESH`).
 * Both use `service_cpm` because that's the RPM metric every service-
 * scoped layer reports. Layers that aren't active on the OAP install
 * are silently skipped by the traffic route. */
const DEFAULT_CONFIG: AlarmsConfig = {
  trafficLayers: [
    { layerKey: 'GENERAL', mqe: 'service_cpm', label: 'Agent' },
    { layerKey: 'MESH', mqe: 'service_cpm', label: 'Mesh' },
  ],
};

export class AlarmsStore {
  private readonly absPath: string;
  private cache: AlarmsConfig | null = null;
  private writing: Promise<void> | null = null;

  constructor(filePath: string) {
    this.absPath = resolve(filePath);
  }

  async load(): Promise<AlarmsConfig> {
    if (this.cache) return this.cache;
    if (!existsSync(this.absPath)) {
      this.cache = { ...DEFAULT_CONFIG, trafficLayers: [...DEFAULT_CONFIG.trafficLayers] };
      return this.cache;
    }
    try {
      const raw = await readFile(this.absPath, 'utf8');
      const parsed = JSON.parse(raw) as Partial<AlarmsConfig> & { generatedAt?: number };
      const trafficLayers = Array.isArray(parsed.trafficLayers)
        ? parsed.trafficLayers.filter(
            (l): l is AlarmTrafficLayer =>
              typeof l === 'object' &&
              l !== null &&
              typeof (l as AlarmTrafficLayer).layerKey === 'string' &&
              typeof (l as AlarmTrafficLayer).mqe === 'string',
          )
        : [...DEFAULT_CONFIG.trafficLayers];
      this.cache = { trafficLayers };
      return this.cache;
    } catch (err) {
      logger.warn({ err, path: this.absPath }, 'alarms store unreadable; using defaults');
      this.cache = { ...DEFAULT_CONFIG, trafficLayers: [...DEFAULT_CONFIG.trafficLayers] };
      return this.cache;
    }
  }

  async save(next: AlarmsConfig): Promise<void> {
    while (this.writing) await this.writing;
    const tmp = `${this.absPath}.tmp`;
    const snapshot: AlarmsConfig = JSON.parse(JSON.stringify(next));
    const work = (async () => {
      await mkdir(dirname(this.absPath), { recursive: true });
      await writeFile(
        tmp,
        JSON.stringify({ generatedAt: Date.now(), ...snapshot }, null, 2),
        'utf8',
      );
      await rename(tmp, this.absPath);
      this.cache = snapshot;
    })();
    this.writing = work;
    try {
      await work;
    } finally {
      this.writing = null;
    }
  }
}
