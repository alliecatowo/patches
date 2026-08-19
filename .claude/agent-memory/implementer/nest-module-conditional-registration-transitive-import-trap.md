---
name: nest-module-conditional-registration-transitive-import-trap
description: removing a Nest module from AppModule.imports does nothing if another always-on module imports it too — conditionality must live in a narrower module
metadata:
  type: feedback
---

Nest dedupes a module by class reference across however many other modules import it — if
`ModuleA` is imported both by `AppModule` directly AND by some always-registered `ModuleB`
(e.g. for a DI token `ModuleA` exports), removing it from `AppModule.imports` conditionally
changes nothing: it's still fully registered (controllers included) via `ModuleB`.

**Why:** Found implementing ADR 0016 (P10-004, `[[nest-config-forroot-frozen-once]]`-adjacent
gotcha) — the plan was "drop `FederationModule` from `AppModule.imports` when
`FEDERATION_ENABLED=false` so its controllers are absent." `PostModule`/`ActorModule`/
`GraphModule`/`ReactionModule` all imported `FederationModule` unconditionally for a gateway DI
token, so it stayed fully registered regardless. Fix was splitting the module: the
always-needed part (services/DI token, no controllers) stays as what those four modules import;
a new sibling module holding only the controllers is the thing that's actually conditional in
`AppModule`.

**How to apply:** Before making any Nest module "conditional" on some flag, `grep -rl
"ModuleName"` across the whole app to find every other module that imports it. If an
always-registered module is one of them, the module needs splitting (controllers/routes vs.
DI-only providers) before conditionality is even possible — editing the top-level `AppModule`
alone is never sufficient.
