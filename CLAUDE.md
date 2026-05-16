# CLAUDE.md - AI Assistant Guide for Apache SkyWalking Horizon UI

This file states the **principles** for working in this codebase. It is not a how-to. Code details (directory layout, tech-stack versions, function names, step-by-step recipes) belong in the code itself — read the code when you need them.

## What this project is

**Horizon UI** is the next-generation web UI for [Apache SkyWalking](https://github.com/apache/skywalking). The goal is **feature parity** with [skywalking-booster-ui](https://github.com/apache/skywalking-booster-ui) on the **same OAP GraphQL query-protocol and MQE**, with a modernized, dense, dark-first design. This is a **greenfield rewrite**, not a fork. Backend APIs do not change.

## How to work (the only workflow that matters)

> **Correctness comes first. Speed comes from getting it right the first time, not from skipping steps.**

Every non-trivial change follows the same loop:

1. **Read the code.** Read it end-to-end along the path you intend to change: call site → handler → response shape → consumer. Comments, this file, and prior conversation are *reference* — the source of truth is the current code on disk.
2. **Implement.** Match what the surrounding code already does. If you have to invent a pattern, you probably haven't finished step 1.
3. **Validate against a live OAP.** Run the change against a real OAP server and confirm the wire request/response and the rendered UI. Type-checks and unit tests verify code, not feature behavior.

If no OAP is available to validate against, **stop and ask the developer to provide one** (URL, credentials, demo endpoint, port-forward — whatever). Do not guess at wire shapes, do not mock the data and call it done, do not declare the work complete from a green type-check alone. "I couldn't validate" is an honest, acceptable outcome — silently shipping unvalidated changes is not.

When you can't reproduce the user's symptom locally, say so. Don't invent a fix.

## Backend compatibility

The UI talks to OAP through the **GraphQL query-protocol** (same as booster-ui) and through OAP's admin REST surface. Both contracts are **fixed** — owned by the skywalking repo, not this one.

- **Do not invent fields.** If a screen needs data the protocol doesn't expose, flag it. The right fix is a query-protocol change upstream, not a UI hack or a BFF-side fabrication.
- **The schemas and Java implementations are the authoritative spec** — read them (`oap-server/server-query-plugin/.../query-protocol/*.graphqls` and `oap-server/server-core/.../query/`) before guessing at a wire shape. The demo at `demo.skywalking.apache.org/graphql` (basic-auth `skywalking:skywalking`) is a fine smoke-test target.
- **Booster-ui is the working reference.** When in doubt about how a query is shaped or paged, look at how booster-ui does it.

### Metric entity-scope is load-bearing

Every OAP metric lives under exactly one entity scope (Service / ServiceInstance / Endpoint / relations / Process / All). OAP does not auto-rollup between scopes — querying at the wrong scope returns empty results regardless of MQE wrapping. Before adding or moving a metric, verify its scope against the OAP catalog and confirm it matches the page that will render it. Never invent a BFF-side rollup to bridge a scope mismatch — move the metric or leave the slot empty.

### Time, step, and timezone

- **Step precision is page-family-specific.** Dashboards / overviews / landing scale step with the rolling window (MINUTE / HOUR / DAY). Alarms / traces / logs / live debugger use SECOND because they query event-style data anchored at second precision — MINUTE rounding chops off the most recent (most interesting) events. MQE traffic backdrops use MINUTE because metrics are aggregated at minute granularity.
- **String format is determined by step.** Mixing them throws `verifyDateTimeString` on OAP. Read `DurationUtils.java` in the skywalking repo for the canonical mapping.
- **OAP has a per-request bucket cap.** Long windows must be chunked. Storage backends impose stricter caps that vary by backend — probe, don't assume.
- **All time strings are OAP-server local.** Not UTC, not browser-local. The server's offset is exposed via `getTimeInfo`. The BFF owns this conversion; the UI displays in browser-local (echarts handles ms → local natively).
- **Per-page vs. global time.** The topbar time picker applies only to layer dashboards + overviews. Triage / investigation pages (alarms, traces, logs, profilings, live debugger) own their own time range — do not subscribe them to the global ticker.
- **Picker wiring is a two-sided contract.** The time range only reaches OAP when the UI composable forwards it AND the BFF route accepts it. Verify the actual request, not the intent.

### Other OAP sharp edges

- **Storage backends have undocumented limits.** Page sizes, nested selections, and per-record sub-queries fail at backend-specific thresholds. Degrade list queries to the cheapest selection that satisfies the screen; probe before defaulting.
- **OAP IDs are not always per-record unique.** Some wire `id` fields key on the alarmed/related entity, not the firing instance. Disambiguate composite keys with timestamp before using `id` as a row key.

## Design source of truth

The visual spec (HTML/JSX prototypes, tokens snapshot, planning notes) lives **locally only** under `docs/` (gitignored). The prototypes are the visual spec — recreate them pixel-perfectly in Vue; don't blindly port their component structure, match the rendered output.

If `docs/` is missing on your machine, **ask the user to share the design bundle** before doing visual work. Do not invent layouts.

Design tokens have been lifted into the runtime token CSS — that copy is canonical. `docs/` will be removed once every screen has a Vue implementation with visual sign-off; don't reference its files from production code.

## Things that are non-negotiable

- **TypeScript strict.** No `any` outside `.d.ts` shims.
- **Charts are wrapped.** Never instantiate ECharts directly in a view — always go through the chart components. Same rule for D3: composable owns the lifecycle, tears down on unmount. (This lets us swap libraries and centralize theming/disposal.)
- **One icon component.** No icon font, no inlined SVG one-offs.
- **No CSS-in-JS, no Tailwind.** The design is built on CSS custom properties; Tailwind fights the token system.
- **License headers** on every `.ts` / `.vue` / `.js` / `.yaml` / `.yml` / `.css` / `.scss`. JSON, Markdown, lock files, and generated `.d.ts` are excluded — see `.licenserc.yaml`. CI enforces; run `license-eye -c .licenserc.yaml header check` before pushing.
- **Multi-layer is the spine.** Almost every screen has "this could appear in multiple layers" semantics. Build for that from day one.
- **Synced crosshairs.** Multiple time-series on a dashboard share one cursor. Don't build charts that ignore this.
- **Density beats whitespace.** This is an observability-class UI; information density is a feature.
- **MQE is a core capability**, not a config-screen afterthought. User-editable, syntax-highlighted, debuggable.
- **Admin views use the same look.** LDAP/RBAC/admin are dark, dense, design-tokens — not a separate "settings" UI. Alarms are read-only on the UI side; recovery is backend-automatic (no acknowledge/close/silence actions).
- **Comments earn their keep.** Only write a comment when it does one of two things: (1) introduces an API — what a module / component / exported function is for and how callers should think about it; (2) highlights a non-obvious gotcha — a hidden invariant, a workaround for a specific upstream quirk, a subtle scope/timing constraint. Do **not** write comments that paraphrase the code (`// loop over layers`, `// click handler — toggles open state`, `// returns true when active`). Do **not** leave history-as-comments (`// previously …`, `// moved from …`, `// see commit …`) — that belongs in `git log`. If removing the comment wouldn't confuse a future reader who knows the project, the comment shouldn't be there.

## Commits & PRs

**Never** add `Co-Authored-By: Claude` (or any AI / Anthropic / claude.com / `noreply@anthropic.com` line) to commit messages or PR bodies. Do not append the "🤖 Generated with Claude Code" footer. Per-project directive.

## Common AI failure modes to avoid

1. **Skipping the read.** If you change a route, composable, store, or template without reading it end-to-end first, you will break something subtle. Read first, every time.
2. **Validating with type-checks instead of OAP.** Green `tsc` and green tests do not prove the feature works. If you can't hit a real OAP, ask for one.
3. **Blanket reverts.** `git checkout <file>` discards anyone else's uncommitted changes too. Diff first, revert by hunk.
4. **Faking backend data to "unblock" yourself.** A mocked response that shapes nothing real is worse than no response — it hides the real wire mismatch until much later. Ask for OAP access.
5. **Inventing layouts when `docs/` is missing.** Stop and ask.
