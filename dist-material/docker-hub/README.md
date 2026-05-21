# Apache SkyWalking Horizon UI

> This repository (`apache/skywalking-ui`) is **shared** between two UIs.
> Booster UI (the current production UI) owns the `9.x` / `10.x` tags.
> **Horizon UI** (the next-generation UI) is published under **`horizon-`
> prefixed tags**. Pick your tags accordingly.

**Horizon UI** is the next-generation web UI for [Apache SkyWalking](https://skywalking.apache.org/) — a modernized, dense, dark-first dashboard built on the same OAP GraphQL query-protocol and MQE. It bundles both the backend-for-frontend (BFF) and the built UI in a single image; there is no separate frontend container.

## Tags

| Tag | Points at | Use |
|---|---|---|
| `horizon-X.Y.Z` | A specific Horizon release (e.g. `horizon-0.5.0`). Immutable. | **Production.** Pin to an exact version. |
| `horizon-latest` | The newest Horizon release. Moves over time. | Track the latest Horizon line. |
| `latest` | Newest image published to this repo. | Demos / dev only — do not pin production to `latest`. |

```sh
docker pull apache/skywalking-ui:horizon-0.5.0
```

A SHA-pinned, GHCR-hosted variant is also published at `ghcr.io/apache/skywalking-horizon-ui` for fully reproducible deploys.

## Architectures

Multi-arch manifest: `linux/amd64` and `linux/arm64`. Pulling the tag from any host selects the right architecture automatically.

## Quick start

The image expects a `horizon.yaml` config at `/app/horizon.yaml`. It is **not** baked into the image — provide it via bind-mount or your own layer. A reference config ships at `/app/horizon.example.yaml`.

```sh
# 1. Get the example config to start from
docker run --rm apache/skywalking-ui:horizon-0.5.0 \
  cat /app/horizon.example.yaml > horizon.yaml

# 2. Edit horizon.yaml — point it at your OAP and set auth.

# 3. Run, mounting your config + a durable data volume
docker run -d --name horizon-ui \
  -p 8081:8081 \
  -v "$(pwd)/horizon.yaml:/app/horizon.yaml:ro" \
  -v horizon-data:/data \
  apache/skywalking-ui:horizon-0.5.0
```

Open <http://localhost:8081>.

## Configuration

| Path / Variable | Purpose |
|---|---|
| `/app/horizon.yaml` | Active config. Mount it here (`HORIZON_CONFIG` to relocate). |
| `/app/horizon.example.yaml` | Read-only reference config. Copy from it. |
| `/data/` | Declared `VOLUME`. Audit log, setup state, alarm state, wire debug log land here. Mount for durable storage. |
| `/app/bundled_templates/` | Layer + overview dashboard templates. Writable by the admin template editors. |

Key environment variables (all have sensible defaults in the image):

| Variable | Default | Purpose |
|---|---|---|
| `HORIZON_CONFIG` | `/app/horizon.yaml` | Where the BFF reads its config. |
| `HORIZON_SERVER_HOST` / `HORIZON_SERVER_PORT` | `0.0.0.0` / `8081` | Bind address. The image `EXPOSE`s `8081`. |
| `LOG_LEVEL` | `error` (production) | `trace`/`debug`/`info`/`warn`/`error`/`fatal`. |

The container runs as the non-root user `horizon`.

## Documentation

* Project: <https://github.com/apache/skywalking-horizon-ui>
* SkyWalking: <https://skywalking.apache.org/>
* Issues: <https://github.com/apache/skywalking/issues>

## License

[Apache License 2.0](https://github.com/apache/skywalking-horizon-ui/blob/main/LICENSE).
