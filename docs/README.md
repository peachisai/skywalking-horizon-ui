# Apache SkyWalking Horizon UI

Horizon UI is the next-generation web UI for Apache SkyWalking. It targets feature parity with the existing booster-ui against the same OAP GraphQL query-protocol and MQE, with a modernized dense dark-first design.

The sidebar on the left of this site is the canonical entry point — every section below has its own page there. This README is the orientation map.

## How it's organized

- **Design Target** — what Horizon UI is built for and how it differs from booster-ui.
- **Compatibility** — which OAP version + modules + ports Horizon needs, and what each pane of the Cluster Status page actually probes.
- **Setup** — quick start, the container image, and a field-by-field reference for `horizon.yaml`.
- **Access Control** — local + LDAP auth, break-glass admin, the role / verb model, the audit log, and the admin pages.
- **Customization** — how the sidebar is composed from OAP layers, how to author layer dashboard and overview templates, and the end-to-end recipe for adding a new layer.
- **Components** — field-by-field reference for every widget primitive and the wrapped chart components.
- **Operate** — Cluster Status & Metadata, and the Inspect page (metric catalog + entity enumerator).

## Quick orientation

The UI is a pnpm monorepo:

| App / package | Purpose |
|---|---|
| `apps/ui/` | Vue 3 + Vite single-page app. |
| `apps/bff/` | Fastify-based Backend For Frontend. The single place that talks to OAP — query GraphQL + admin REST + Zipkin. |
| `packages/api-client/` | TypeScript types shared between BFF and UI. |
| `packages/design-tokens/` | CSS custom properties shipped to both apps (the 5 bundled themes live here). |

The UI **only** talks to the BFF; the BFF is the single place that talks to OAP. Every OAP-side requirement is enforced once, in the BFF, not scattered through the UI.

## Where to start, by role

| If you are… | Read first |
|---|---|
| Deploying Horizon for the first time | Setup → Quick Start, then Compatibility → OAP Version. |
| Wiring up LDAP / configuring roles | Access Control → LDAP Backend, then RBAC. |
| Customizing per-layer dashboards | Customization → Layer Dashboard Templates. |
| Building a "war room" overview | Customization → Overview Templates. |
| Diagnosing a "module disabled" warning | Compatibility → Required OAP Modules and Cluster Status Check Sequence. |

## Live demo

The Apache SkyWalking project runs a public OAP demo at `demo.skywalking.apache.org/graphql` (basic auth `skywalking:skywalking`). Horizon's `horizon.yaml` can point at it for smoke-testing:

```yaml
oap:
  queryUrl: https://demo.skywalking.apache.org
  auth:
    username: skywalking
    password: skywalking
```

The demo exposes the GraphQL query port only; the admin REST port — and therefore the Cluster, Inspect, DSL Management, and Live Debugger pages — is not reachable from outside.

## References

- [Apache SkyWalking](https://github.com/apache/skywalking) — the backend Horizon UI consumes.
- [skywalking-booster-ui](https://github.com/apache/skywalking-booster-ui) — the previous-generation UI; Horizon is feature-equivalent against the same OAP protocol.
- [demo.skywalking.apache.org](https://demo.skywalking.apache.org) — public OAP demo (basic auth `skywalking:skywalking`).
