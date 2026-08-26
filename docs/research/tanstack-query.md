# TanStack Query (React) — polling / refetchInterval

Stack: `@tanstack/react-query` pinned via `catalog:` → `^5.102.0` (pnpm-workspace.yaml); installed
`5.102.3` in the working tree's node_modules. Verified 2026-08-26.

## Question: does `refetchInterval` alone respect tab visibility, or do I need my own

`visibilitychange` gating?

### Verified (official docs)

- `refetchInterval`: "If set to a number, all queries will continuously refetch at this frequency
  in milliseconds." — [useQuery reference](https://tanstack.com/query/latest/docs/framework/react/reference/useQuery)
- `refetchIntervalInBackground`: "If set to `true`, queries that are set to continuously refetch
  with a `refetchInterval` will continue to refetch while their tab/window is in the background."
  — same page. Docs describe the flag as opt-in ("if set to true...") but do not state the literal
  default value in prose; default is confirmed from source below.

### Verified (source — `@tanstack/query-core@5.102.3`, the exact version resolved by the pinned

range, read directly from `node_modules/.pnpm/@tanstack+query-core@5.102.3/.../build/modern/`)

`queryObserver.js`:

```js
#computeRefetchInterval() {
  return (typeof this.options.refetchInterval === "function"
    ? this.options.refetchInterval(this.#currentQuery)
    : this.options.refetchInterval) ?? false;
}
#updateRefetchInterval(nextInterval) {
  ...
  this.#refetchIntervalId = timeoutManager.setInterval(() => {
    if (this.options.refetchIntervalInBackground || focusManager.isFocused())
      this.#executeFetch();
  }, this.#currentRefetchInterval);
}
```

`focusManager.js`:

```js
isFocused() {
  if (typeof this.#focused === "boolean") return this.#focused;
  return globalThis.document?.visibilityState !== "hidden";
}
```

`FocusManager` subscribes to the browser `visibilitychange` event by default (`window.addEventListener("visibilitychange", ...)`) and derives focus state from `document.visibilityState`.

### Answers

1. **Default of `refetchIntervalInBackground` is `false`/falsy** (undefined `options.refetchIntervalInBackground` is falsy in the `||` check above; docs frame it as opt-in). No explicit default is stated in prose, but the source confirms falsy-by-default behavior.

2. **The interval timer is NOT suspended/paused in the background.** `setInterval` keeps firing on schedule regardless of tab state. On _every_ tick, the observer checks `refetchIntervalInBackground || focusManager.isFocused()`. When that's false (default, background tab, `document.visibilityState === "hidden"`), the tick is a no-op — `#executeFetch()` is simply not called, no network request happens, no fetching state is set. This is a per-tick `isFocused()`/visibility check inside the query observer's interval callback, not a `focusManager.onFocus`/subscription-driven pause — the observer doesn't subscribe to focus events for this purpose, it just samples `focusManager.isFocused()` (which itself derives from `visibilitychange`/`document.visibilityState`) at fetch time.

3. **Nuance confirmed:** the timer keeps running in the background (ticks are not skipped or delayed at the JS-timer level — modulo normal browser background-tab timer throttling, which is a browser behavior, not TanStack Query's). Each tick that lands while the tab is hidden is silently skipped (does not set `isFetching`, does not hit the network). There is no "catch-up" fetch on refocus caused by the interval mechanism itself — the _next_ interval tick after refocus will fire normally (since `isFocused()` will now be true), but nothing about becoming visible forces an immediate fetch via `refetchInterval`. (Note: `refetchOnWindowFocus`, a separate default-`true` option, is what triggers a fetch specifically _on_ the focus/visibility transition — that's an independent mechanism from `refetchInterval`/`refetchIntervalInBackground` and not asked about here, but relevant if the app also wants "fetch immediately on refocus.")

### Practical conclusion for DM polling

Setting `refetchInterval: 60_000` with `refetchIntervalInBackground` left at its default (falsy) is
sufficient to get "poll every 60s only while the tab is focused/visible" — no custom
`document.visibilitychange` or focus-gating code is needed. The gating is already implemented
inside `QueryObserver` via `focusManager.isFocused()`, which itself is driven by the
`visibilitychange` event by default in a browser environment.

<!-- Sources: https://tanstack.com/query/latest/docs/framework/react/reference/useQuery ;
     installed source: node_modules/.pnpm/@tanstack+query-core@5.102.3/node_modules/@tanstack/query-core/build/modern/{queryObserver,focusManager}.js -->
