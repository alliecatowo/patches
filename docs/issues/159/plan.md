# Issue #159 plan

## Scope

Document the exercised MCP setup/calls and preserve adversarial verification evidence for the transport rollout.

## Checklist

- [x] Reproduce the baseline and inspect the existing MCP slice.
- [x] Add/update exercised MCP architecture and research documentation.
- [x] Verify adversarial coverage for protocol version, Origin, OAuth audience/scope, approval bypass, SSRF, replay, cancellation, subscription isolation, sensitive output, and audit provenance.
- [x] Record client interoperability evidence status and commands actually run.
- [ ] Run scoped validation, commit, publish PR, and update the issue workpad.

## Acceptance criteria

- [x] Documentation describes only setup/calls exercised in the available MCP source branch.
- [x] Every requested adversarial category has a deterministic test or an explicit evidence-backed limitation.
- [x] Interoperability evidence status is recorded; rollout remains blocked pending an independent client.
