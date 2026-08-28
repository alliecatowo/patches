# Sentry direct OTLP trace ingestion

Verified: 2026-08-27
Stack in repo: `@opentelemetry/exporter-trace-otlp-http` (raw OTLP exporter, no `sentry-otel`/`@sentry/opentelemetry` SDK), used from `packages/observability/src/instrumentation.ts`.

## Verified (official docs — docs.sentry.io)

Source: [Sentry docs — Direct OTLP: Traces](https://docs.sentry.io/concepts/otlp/direct/traces) (raw: `https://docs.sentry.io/concepts/otlp/direct/traces.md`), overview page [Sentry docs — Direct OTLP](https://docs.sentry.io/concepts/otlp/direct/).

- **Endpoint URL is per-org + per-project, not a fixed global host.** Documented pattern:
  `https://o<orgId>.ingest.sentry.io/api/<projectId>/integration/otlp/v1/traces`
  — `otel.sentry.io` (fixed global host, no org/project in the path) is **not** the documented
  endpoint. The path also includes `/integration/otlp/v1/traces`, not just `/v1/traces`.
- **Auth header is not Bearer.** Documented header:
  `x-sentry-auth: sentry sentry_key=<your-public-key>`
  — i.e. the DSN's **public key** component only (not the whole DSN string, not `Authorization: Bearer <dsn>`).
- Configuration is via standard OTel env vars: `OTEL_EXPORTER_OTLP_TRACES_ENDPOINT` and
  `OTEL_EXPORTER_OTLP_TRACES_HEADERS` (generic OTel SDK env vars, matching what
  `packages/observability` already reads for the non-Sentry path — `OTEL_EXPORTER_OTLP_ENDPOINT`).
- **Feature status: open beta, not GA.** Doc text: "This feature is currently in open beta.
  Please reach out to feedback-tracing@sentry.io if you have feedback or questions."
- Documented limitations of this beta path: span events are dropped entirely on ingest; span
  links are ingested/displayed but not searchable/filterable/aggregatable; array attributes same
  (ingested/displayed, not searchable/filterable/aggregatable).
- The org id (`o<orgId>`) and project id are both found in Project Settings → Client Keys (DSN)
  per Sentry's own guidance — i.e. derived from the DSN's components, not the raw DSN string
  itself.

## Inferred / unverified

- Regional hosts (e.g. `.ingest.us.sentry.io` for US-region orgs vs `.ingest.sentry.io` for the
  default/EU or global) were mentioned in an AI-generated search snippet but the fetched official
  doc page only showed the bare `o<orgId>.ingest.sentry.io` form. **Not independently confirmed**
  against the primary doc text — treat any region-specific subdomain as unverified until a
  fetch of the doc explicitly shows it (Sentry does have region-based ingest hosts for the
  standard error/DSN endpoint, e.g. `https://o<orgId>.ingest.us.sentry.io/...`, so it is plausible
  the OTLP endpoint follows the same region convention, but this note does not confirm it).
- Whether `sentry_key=` must be the _only_ value or can be combined with other `x-sentry-auth`
  fields (e.g. `sentry_version`) as in Sentry's classic store-endpoint auth header was not checked
  — the traces doc's example only shows `sentry sentry_key=<public-key>`.
- No confirmation found of a documented `Authorization: Bearer <dsn>` scheme anywhere in Sentry's
  OTLP docs; this appears to be an invented/incorrect API shape, not a deprecated-but-once-real one.

## Discrepancy with current code

`packages/observability/src/instrumentation.ts` currently hardcodes:

```ts
const sentryOtlpEndpoint = 'https://otel.sentry.io/v1/traces';
const headers = { Authorization: `Bearer ${sentryDsn}` };
```

Both the endpoint and the auth header are **wrong** per official docs:

- Endpoint should be per-org/per-project (`https://o<orgId>.ingest.sentry.io/api/<projectId>/integration/otlp/v1/traces`), not the fixed `otel.sentry.io/v1/traces` host+path.
- Auth should be `x-sentry-auth: sentry sentry_key=<public-key>`, not `Authorization: Bearer <full-dsn>`.
- The full DSN string (`https://<publicKey>@o<orgId>.ingest.sentry.io/<projectId>`) already
  contains the org id, project id, and public key needed to construct both the correct URL and
  header — so it is _possible_ to derive a correct implementation by parsing the DSN, but this
  requires DSN parsing logic (`new URL(dsn)`) that the current code does not do at all (it treats
  the whole DSN as an opaque bearer token).
- The feature is beta, not GA — worth flagging in any implementation as "Sentry beta, may change."

## Suggested follow-up

- This is a functional bug, not just a doc gap: the current `sentryDsn` branch in
  `instrumentation.ts` will silently fail against real Sentry (wrong host, wrong path, wrong auth
  header) — traces sent this way are likely rejected/dropped.
- Two fix options for `implementer`/`architect` to choose between:
  1. **Fix in place**: parse the DSN URL to extract `orgId` (from the ingest host,
     `o<orgId>.ingest.sentry.io`), `projectId` (URL path), and `publicKey` (URL username), then
     build the documented endpoint + `x-sentry-auth` header.
  2. **Delete the Sentry-specific branch entirely**, and document that operators wanting Sentry
     traces must set `OTEL_EXPORTER_OTLP_ENDPOINT` / `OTEL_EXPORTER_OTLP_HEADERS` themselves using
     the values from Sentry's docs (Project Settings → Client Keys) — the generic path already
     works and matches Sentry's own documented env-var-based config approach, and avoids
     `packages/observability` special-casing a beta third-party API shape that may change.
  - Given the feature is Sentry-beta and the generic OTLP path already exists and is
    spec/architecture-neutral, option 2 is likely the lower-maintenance choice — flagging for an
    ADR is not required (this isn't a v0 hard-rule/stack conflict), but it is a real bug fix either
    way and should be a task, not left as-is.
