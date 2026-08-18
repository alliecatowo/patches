# Security Policy

Thanks for helping keep Patches and its users safe. This document explains
what's in scope, how to report a vulnerability privately, and what to expect
after you do.

## Supported versions

Patches is pre-1.0. There are no version branches to choose between yet —
only `main` is supported, and only the latest commit on `main` receives
security fixes. If you're running an older checkout, please update before
reporting, if that's practical for you.

Once Patches reaches 1.0, this policy will be updated with a real supported-
versions table.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**
A public issue is a roadmap for abuse before there's a fix.

Instead, report privately using one of these:

1. **GitHub private vulnerability reporting** (preferred): open a report via
   the "Security" tab on this repository → "Report a vulnerability". This
   creates a private advisory that only maintainers can see.
2. **Email**: allisonemilycoleman@gmail.com. Please include "SECURITY" in
   the subject line so it doesn't get lost.

When reporting, include as much of the following as you reasonably can:

- A description of the vulnerability and its potential impact.
- Steps to reproduce, or a minimal proof of concept.
- The affected component (server, TUI, worker, proto schema, infra) and
  commit/version if known.
- Whether you believe the issue is already being exploited.

## What's in scope

- **`apps/server`** — the NestJS/gRPC backend: auth, authorization, social
  graph, moderation, data handling.
- **`apps/tui`** — the Ink terminal client, including credential storage and
  local caching behavior.
- **`apps/worker`** — background job processing, including media
  processing and anything that touches uploaded files.
- **`packages/proto`** — the protobuf/gRPC API contract.
- Deployment/infrastructure configuration in this repository (`infra/`,
  `.github/workflows/`), to the extent it's part of what's committed here.

Things like authentication bypass, authorization/object-level access
control bugs, injection, insecure deserialization, SSRF, credential or
secret exposure, and unsafe handling of uploaded media are all squarely in
scope.

## What's out of scope

- Third-party services we depend on but don't control (report those
  upstream) — this includes the hosting platform, object storage provider,
  and any dependency's own CVEs (please report those to the dependency
  maintainers, though a heads-up here is still welcome if it affects us
  directly).
- Social-engineering or physical-security attacks against maintainers.
- Vulnerabilities that require a compromised or malicious server operator
  (Patches assumes the operator running an instance is trusted; that trust
  boundary may narrow as federation work begins).
- Denial-of-service via brute-force volume alone, without a novel
  amplification or bypass.
- Reports generated purely by automated scanners without a demonstrated,
  concrete impact.
- Missing best-practice headers or hardening suggestions with no
  demonstrated exploit path — these are welcome as regular issues, just not
  as security reports.

## What to expect

This is a solo/small-team open-source project, not a company with a
dedicated security team, so please be patient — but reports won't be
ignored:

- **Acknowledgment**: within a few days of your report.
- **Triage and initial assessment**: within about a week, including
  whether it's accepted, needs more information, or is out of scope.
- **Fix timeline**: depends on severity. Critical issues (auth bypass, data
  exposure, remote code execution) are prioritized above everything else in
  active development. Lower-severity issues will be scheduled alongside
  normal work.
- **Disclosure**: we'll coordinate with you on timing before any public
  disclosure or advisory. Credit is given if you want it; anonymity is
  respected if you'd rather not be named.

## No bounty program

Patches does not currently run a paid bug bounty program. Reports are
genuinely appreciated and will be credited (with your permission) in
release notes or a security advisory, but there's no monetary reward on
offer right now.
