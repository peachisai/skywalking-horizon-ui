# Licensed to the Apache Software Foundation (ASF) under one or more
# contributor license agreements.  See the NOTICE file distributed with
# this work for additional information regarding copyright ownership.
# The ASF licenses this file to You under the Apache License, Version 2.0
# (the "License"); you may not use this file except in compliance with
# the License.  You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

# Copy-in image. The image does NOT compile anything and does NOT run
# `pnpm install` — it consumes the pre-built `./dist/` produced by
# `pnpm package` at the repo root and lays it out under `/app/`. Build
# the artifact first:
#
#     pnpm install            # one-time / on lockfile changes
#     pnpm package            # produces ./dist/ (server.js + node_modules
#                             # + bundled_templates + static + example yaml)
#     docker build -t horizon-ui:local .
#
# Net effect: tiny image (no Node toolchain, no devDeps, no pnpm store,
# no source), reproducible (the dist/ tarball is the contract), and
# air-gap-friendly (image build needs zero network).

FROM node:20-alpine
WORKDIR /app

# Run as a non-root user — the BFF doesn't need any privileged access.
RUN addgroup -S horizon && adduser -S -G horizon horizon

# Pre-built artifact. Layout matches what `node server.js` expects:
# server.js + bundled_templates + node_modules + static all siblings
# under /app/. The bundled-template loader probes `__dirname/bundled_
# templates` first (see apps/bff/src/logic/layers/loader.ts).
#
# Read-only artifacts owned by root:
COPY dist/server.js              ./server.js
COPY dist/package.json           ./package.json
COPY dist/node_modules           ./node_modules
COPY dist/static                 ./static
COPY dist/horizon.example.yaml   ./horizon.example.yaml

# `bundled_templates/` is writable: the admin Layer-Templates and
# Overview-Templates editors `writeFileSync` into per-key / per-id JSON
# files. Owned by the `horizon` user so saves don't EACCES.
COPY --chown=horizon:horizon dist/bundled_templates  ./bundled_templates

# `/data` is the writable state directory the BFF writes its runtime
# files into (audit log, setup state, alarm state, wire debug log).
# Operators mount a PVC / named volume / host bind here for durable
# storage. Without a mount the writes go to the container's writable
# layer (ephemeral).
RUN mkdir -p /data && chown horizon:horizon /data
VOLUME ["/data"]

ENV NODE_ENV=production \
    HORIZON_SERVER_HOST=0.0.0.0 \
    HORIZON_SERVER_PORT=8081 \
    HORIZON_STATIC_DIR=/app/static \
    HORIZON_CONFIG=/app/horizon.yaml \
    HORIZON_AUDIT_FILE=/data/horizon-audit.jsonl \
    HORIZON_SETUP_FILE=/data/horizon-setup.json \
    HORIZON_ALARMS_FILE=/data/horizon-alarms.json \
    HORIZON_WIRE_LOG_FILE=/data/horizon-wire.jsonl

USER horizon
EXPOSE 8081
CMD ["node", "server.js"]
