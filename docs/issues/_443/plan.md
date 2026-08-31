# Issue #443 plan

1. [x] Reproduce the archive-scale context signal and inspect current agent bootstrap.
2. [x] Add a dependency-free bounded worker-context packer with CI-repair evidence and telemetry.
3. [x] Add regression tests and document the contract; tighten session-start output.
4. [x] Run targeted validation and leave changes for the delivery harness.

The final hardening slice also bounds individual paths and commands and guarantees that packet
fitting terminates for adversarially large lists.
