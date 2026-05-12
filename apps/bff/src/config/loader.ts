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

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chokidar from 'chokidar';
import YAML from 'yaml';
import { configSchema, type HorizonConfig } from './schema.js';

export interface ConfigSource {
  readonly current: HorizonConfig;
  readonly path: string;
  /** Function form for code paths that prefer a getter call. Returns the same as `.current`. */
  current_(): HorizonConfig;
  onChange(fn: (cfg: HorizonConfig) => void): () => void;
  close(): Promise<void>;
}

function parseFile(absPath: string): HorizonConfig {
  let raw = '';
  try {
    raw = readFileSync(absPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      // No config file → use full defaults.
      return configSchema.parse({});
    }
    throw err;
  }
  const parsed = YAML.parse(raw) ?? {};
  return configSchema.parse(parsed);
}

export function loadConfig(configPath: string): ConfigSource {
  const absPath = resolve(configPath);
  let current = parseFile(absPath);
  const listeners = new Set<(cfg: HorizonConfig) => void>();

  const watcher = chokidar.watch(absPath, { ignoreInitial: true, awaitWriteFinish: true });
  watcher.on('change', () => {
    try {
      const next = parseFile(absPath);
      current = next;
      for (const fn of listeners) fn(next);
    } catch {
      // Swallow; the server logs the parse error elsewhere when it tries to
      // use the new config. We don't want a malformed reload to kill the watcher.
    }
  });

  return {
    get current() {
      return current;
    },
    current_: () => current,
    path: absPath,
    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async close() {
      await watcher.close();
    },
  };
}
