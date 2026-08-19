---
name: protobuf-es-numeric-enums-vs-ts-proto-string-enums
description: protobuf-es (@patches/proto/es, used by @patches/client/apps/web) emits plain numeric TS enums with the type prefix stripped from member names — the opposite runtime shape from the ts-proto/proto-loader family
metadata:
  type: project
---

`@patches/proto/es` (protobuf-es/Connect codegen, ADR 0016 §2) generates ordinary
TypeScript numeric enums with the enclosing enum's name prefix stripped from each member
(`FilterAction.HIDE`, not `FilterAction.FILTER_ACTION_HIDE`). At runtime this is a real TS
numeric enum, so it gets the compiler's automatic reverse mapping: `FilterAction[1] ===
'HIDE'`. Request/response messages carry the numeric value, not a string.

This is the **opposite** runtime shape from the ts-proto/`@grpc/proto-loader` family used
elsewhere in this repo (`@patches/proto`'s root/`./nest` entry points), where
[[proto-stringEnums-runtime-mismatch]] documents that proto-loader always decodes an enum
to its fully-prefixed string name (`'FILTER_ACTION_HIDE'`) regardless of ts-proto's
numeric-looking type. Both notes are true simultaneously — they're about two different,
deliberately separate codegen outputs (`@patches/proto` root vs `@patches/proto/es`) that
never meet in one process (see `es.ts`'s module doc). Don't assume the fix for one applies
to the other.

**Why:** discovered building `apps/web`'s Amendment C settings screens (P14-018) against
`@patches/proto/es`'s `FilterAction`/`FilterScope`/`FilterTermKind`/`LabelAction`/
`AppealStatus`/etc. enums — needed a humanizer and initially assumed proto-loader's string
convention applied.

**How to apply:** when rendering a protobuf-es enum value for display, reverse-look-up the
member name via `EnumObject[value]` (works because it's a real numeric enum), then
title-case that bare name — see `apps/web/src/lib/enumLabels.ts`'s `humanizeEnumValue`. Do
not add a `FILTER_ACTION_` -style prefix strip; there is no prefix to strip in this family.
