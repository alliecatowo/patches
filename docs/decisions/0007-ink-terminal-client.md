# 0007. Ink (React for terminals) as the primary client framework

**Status:** Accepted
**Date:** 2026-08-17

## Context

Patches' defining characteristic is that its primary first-class client is a terminal
application — not a website with a novelty CLI wrapper. The TUI needs real component
structure (screens, reusable components, navigation, state), image rendering support
(Kitty graphics protocol), and needs to share conceptual/type patterns with the rest of a
TypeScript codebase and, eventually, a React Native client.

## Decision

Use **Ink 7.x** (React component model for terminal UIs) with **React 19.x** and
TypeScript as the TUI framework, in `apps/tui`. Structure the app by feature, not as one
giant component: `app/` (App, router, providers), `screens/` (HomeScreen, LocalScreen,
ThreadScreen, ProfileScreen, NotificationsScreen, SearchScreen, ComposeScreen,
SettingsScreen), `components/` (PostCard, Media, ActorHeader, StatusBar, CommandBar,
Modal), plus `hooks/`, `api/`, `auth/`, `media/`, `state/`, `theme/`, `terminal/`. Network
calls do not live directly inside render components. `@inkjs/ui` may be used selectively,
but generic components do not get to dictate the product's visual identity. Kitty graphics
protocol is the target for inline image rendering, with defensive detection and fallback
behavior when Kitty is unavailable — the TUI must never require a browser or crash when
Kitty is absent (`INITIAL_VISION.md` §153).

## Consequences

- React's component/hook model transfers directly to contributors already comfortable with
  React, lowering the barrier to building a genuinely rich terminal UI instead of an
  ncurses-style imperative mess.
- Sharing conceptual patterns (not code) with a future React Native client is more natural
  than it would be with a non-React TUI framework — though UI components themselves are
  explicitly not shared (`INITIAL_VISION.md` §144).
- Image rendering is a real technical risk (terminal support for Kitty graphics varies) —
  this is treated as a Phase 0 spike specifically because of that risk, with a fallback path
  required, not optional.
- Ink's terminal rendering model has its own quirks (full-screen behavior, resize handling,
  cursor/alt-screen management) that must be handled deliberately — this is not "a website
  in a box."
- Choosing Ink forecloses non-JS TUI ecosystems (e.g. a Rust TUI framework) that might offer
  raw performance advantages, in favor of ecosystem/type-sharing consistency.

## Alternatives considered

- **A Rust/Go/Python TUI framework (e.g. ratatui, bubbletea, textual).** Rejected:
  explicitly prohibited (`INITIAL_VISION.md` §0). Would fragment the stack across languages
  and lose type/schema sharing with the generated protobuf client code.
- **Raw Node terminal libraries (blessed, plain ANSI escape handling) without a component
  model.** Rejected: would require building an ad hoc component/state system from scratch —
  Ink already provides that on top of React's proven model.
- **A conventional website as the primary client, with the CLI as a thin wrapper.**
  Rejected: contradicts the product's core identity — "the terminal application is the
  actual social application," not a gimmick in front of a website (`INITIAL_VISION.md` §1).
