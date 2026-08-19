# `ink-picture` adoption for the Patches TUI

**Verified:** 2026-08-19  
**Target evaluated:** `ink-picture@1.3.5` (npm `gitHead`
`bccf250fc1bfc0041f85138cafe40ccdde75cd76`)  
**Patches stack verified:** Node 24, pnpm 11, TypeScript 5.9, `ink@7.1.1`,
`react@19.2.8`, `sharp@0.35.3`  
**Decision:** **reject `ink-picture@1.3.5`** — do not replace or wrap
`@patches/terminal-media`, and do not adopt its text renderers alone.

## 1. Scope and source identity

### Documented facts

- Patches' catalog currently selects `ink: ^7.1.1`, `react: ^19.2.8`, and
  `sharp: ^0.35.3`; the TUI and `@patches/terminal-media` consume those catalog entries
  ([`pnpm-workspace.yaml`](../../pnpm-workspace.yaml),
  [`apps/tui/package.json`](../../apps/tui/package.json),
  [`packages/terminal-media/package.json`](../../packages/terminal-media/package.json)).
- The official npm metadata for [`ink-picture@1.3.5`](https://registry.npmjs.org/ink-picture/1.3.5)
  identifies commit `bccf250fc1bfc0041f85138cafe40ccdde75cd76`, Node `>=18`, peer ranges
  `ink >=5` and `react >=18`, and runtime dependencies on Chalk, Sharp, Sixel,
  `node-fetch`, `iterm2-version`, `supports-color`, and `is-unicode-supported`. Its own
  development dependencies test against Ink `^6.8.0` and React `^19.1.1`
  ([exact `package.json`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/package.json)).
- npm published 1.3.5 on 2026-03-11. npm now marks 2.1.0, published 2026-07-07,
  as `latest`; 1.3.5 is therefore an old major line, not the current release
  ([official npm metadata](https://registry.npmjs.org/ink-picture)).
- An isolated pnpm install of Ink 7.1.1, React 19.2.8, and `ink-picture@1.3.5`
  completed, and importing both packages under Node 24 succeeded. This proves package
  resolution and module loading only. The package did **not** export `KittyImage` in 1.3.5;
  it exported the default auto/forced-protocol component plus the ASCII, Braille,
  half-block, Sixel, provider, terminal-info, and positioning APIs
  ([1.3.5 exports](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/index.ts)).

### Inferred conclusions

- **Inferred:** the peer range will not block an Ink 7 installation, but the broad range
  is not evidence that the image lifecycle works on Ink 7. The 1.3.5 image renderers have
  no Ink 7 test, and the project's three tests exercise terminal query/input behavior,
  not image layout, navigation, placement, or cleanup
  ([1.3.5 tests](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/test/test.ts)).

## 2. Patches' accepted contract and current baseline

### Documented facts

The accepted interaction ADR requires all of the following
([ADR 0018](../decisions/0018-tui-interaction-model.md),
[TUI interaction model §2.6](../architecture/tui-interaction-model.md#26-image-policy--decided-p)):

1. one fixed, measured frame;
2. inline graphics only for a selected list row, a thread's focused post, or the media viewer;
3. the image and fallback box occupy the same measured height;
4. no more than four live placements, with LRU eviction and `d=I` cleanup;
5. release on route pop, eviction, overlay snapshot, resize/replacement, and process exit.

The implementation presently has these relevant properties:

- `@patches/terminal-media` transmits PNG bytes as a Kitty **virtual placement** and
  renders `U+10EEEE` Unicode placeholder cells through Ink's text layout. It uses random
  24-bit image IDs, joins all chunks into one stdout write, suppresses replies, supports
  tmux passthrough, and deletes each image with `d=I`
  ([renderer](../../packages/terminal-media/src/renderer.ts),
  [Kitty protocol builders](../../packages/terminal-media/src/protocol/kitty.ts)).
- It bounds encoded input at 10 MB and Sharp decode size at 20 million pixels before
  converting to PNG. It caches a prepared image by content hash and cell budget and
  releases the stale size on resize
  ([renderer](../../packages/terminal-media/src/renderer.ts)).
- Capability probing occurs before Ink takes stdin. Process-level cleanup is installed
  outside React, and the TUI's `finally` path calls `releaseAll()` after Ink exits
  ([detection](../../packages/terminal-media/src/detect.ts),
  [cleanup](../../packages/terminal-media/src/cleanup.ts),
  [TUI entry point](../../apps/tui/src/cli.tsx)). This ordering matches Ink 7's documented
  rule that alternate-screen teardown output is disposable
  ([Ink 7.1.1 `alternateScreen`](https://github.com/vadimdemedes/ink/blob/v7.1.1/readme.md#alternatescreen)).
- `MediaAttachments` defaults `inline` to false, and there is currently no call site that
  opts in. Timelines and page blocks therefore render the three-row metadata fallback
  without fetching image bytes
  ([component](../../apps/tui/src/components/MediaAttachments.tsx),
  [post row](../../apps/tui/src/components/PostRow.tsx)).
- The current renderer has an unbounded live-ID set rather than a four-entry LRU. The
  current inline hook cancels state updates but does not release a prepared image on
  unmount, and its inline image can be up to `maxRows` while the fallback is three rows
  ([renderer](../../packages/terminal-media/src/renderer.ts),
  [hook](../../apps/tui/src/hooks/useMediaAttachment.ts),
  [component](../../apps/tui/src/components/MediaAttachments.tsx)). These are known gaps
  against the accepted, not-yet-landed P12-018 contract.

### Inferred conclusions

- **Inferred:** the reported prolonged-navigation failure is consistent with frame
  overflow/reflow and unbounded placement churn, but the exact terminal-side failure has
  not been isolated by a real-terminal automated test. ADR 0018 treats the measured frame
  and bounded image policy as the remedy.
- **Inferred:** `ink-picture` should be compared with the accepted target, not credited
  for shortcomings that also remain in today's custom implementation. Adopting another
  renderer does not remove the need to land P12-018's LRU, ownership, and equal-height
  tests.

## 3. What `ink-picture@1.3.5` actually does

### 3.1 Positioning and visibility — documented

- Its Kitty renderer reserves a flex-growing Ink `Box`, buffers and resizes an image,
  transmits it under a sequential image ID, then places a **real**, cursor-positioned
  Kitty placement with `a=p`, `p=1`. An effect repeats the placement after every component
  render because Ink may overwrite terminal content
  ([`Kitty.tsx`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Kitty.tsx)).
- Its `usePosition` walks Ink's `parentNode`/Yoga tree after each render and updates state
  only when the computed position changes. **Version 1.3.5 has no timer or 16 ms poll**
  ([`usePosition.ts`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/hooks/usePosition.ts)).
- Version 1.3.5 has no `useVisibility`, `getVisibility`, or full/partial/hidden protocol
  map. Its default component falls back only when a renderer reports that its protocol is
  unsupported
  ([image dispatcher](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/index.tsx)).
- Ink 7.1.1 officially exports `measureElement` and `useBoxMetrics`; the latter updates
  when layout changes. `ink-picture@1.3.5` does not use it
  ([Ink 7.1.1 layout APIs](https://github.com/vadimdemedes/ink/blob/v7.1.1/readme.md#useboxmetricsref)).
- The Kitty specification says a placement made with `a=p` appears at the current cursor
  position. Reusing the same image-ID/placement-ID pair replaces the previous placement;
  Unicode placeholders instead move and clear with their underlying text
  ([official Kitty protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/#display-images-on-screen),
  [Unicode placeholders](https://sw.kovidgoyal.net/kitty/graphics-protocol/#unicode-placeholders)).

### 3.2 Lifecycle and cleanup — documented

- The Kitty component deletes with `a=d,d=I,i=<id>` from a React effect cleanup on image
  change or component unmount. It has no package-level Kitty placement registry,
  `releaseAll()`, LRU, route-pop API, or outside-React exit cleanup
  ([`Kitty.tsx`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Kitty.tsx)).
- Image processing is asynchronous and has no abort/cancel guard. Transmission completes
  before `setImageId()` is called, while the cleanup effect closes over the committed
  `imageId`. Position or size changes can start additional fetch/decode/transmit work
  ([`Kitty.tsx`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Kitty.tsx)).
- IDs come from a process-global sequential range. Although a `freeId` helper exists,
  `Kitty.tsx` never imports or calls it. The Kitty specification warns that image IDs are
  shared with other programs in the terminal session
  ([ID generator](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/utils/generateKittyId.ts),
  [Kitty image IDs](https://sw.kovidgoyal.net/kitty/graphics-protocol/#requesting-image-ids-from-the-terminal)).
- The Sixel and iTerm2 renderers install `exit`, `SIGINT`, and `SIGTERM` listeners from
  each render effect, deliberately disable cleanup at process exit, and clear old image
  rectangles by cursor-positioning and writing spaces
  ([Sixel](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Sixel.tsx),
  [iTerm2](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/ITerm2.tsx)).
- Kitty requires direct-transfer base64 chunks of at most 4096 bytes, no interleaved
  graphics commands, and a final `m=0` chunk
  ([official Kitty protocol](https://sw.kovidgoyal.net/kitty/graphics-protocol/#remote-client)).
  Version 1.3.5 chunks correctly in a synchronous loop but has no central renderer-level
  serializer across component instances.

### 3.3 Cache, input, and dependencies — documented

- Version 1.3.5 has no image cache. Every renderer calls its own `fetchImage()`, which
  treats strings beginning with `http` as URLs and all other strings as local paths,
  buffers the complete response/file, and constructs Sharp without an application byte
  limit, timeout, abort signal, protocol allowlist, or explicit pixel ceiling
  ([`image.ts`](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/utils/image.ts)).
- Patches already has a bounded 100 MB on-disk LRU keyed by media ID/variant and fetches
  authenticated, server-issued download URLs
  ([media cache](../../apps/tui/src/media/cache.ts),
  [media hook](../../apps/tui/src/hooks/useMediaAttachment.ts)).
- `ink-picture@1.3.5` declares `sharp ^0.34.3`. On 2026-08-19 an isolated pnpm install
  resolved Sharp 0.34.5, which cannot deduplicate with Patches' Sharp 0.35.3 because
  `^0.34.3` excludes 0.35.x. The installation therefore adds a second Sharp/libvips
  native dependency even if only text rendering is selected.
- A production `pnpm audit` of that isolated exact install reported
  [GHSA-f88m-g3jw-g9cj](https://github.com/advisories/GHSA-f88m-g3jw-g9cj): Sharp versions
  below 0.35.0 inherit high-severity libvips vulnerabilities when processing untrusted
  input. The fixed line starts at Sharp 0.35.0. `ink-picture@1.3.5`'s declared range
  cannot select the fix.
- The dependency also installs `node-fetch@3` despite Node 24's fetch API and
  `sixel@0.16.0`; official npm metadata shows Sixel 0.16.0 was last published in May
  2022 ([Sixel npm metadata](https://registry.npmjs.org/sixel/0.16.0)).

### 3.4 Text fallbacks — documented

- ASCII, Braille, and half-block are image-to-text renderers, not Patches' metadata-only
  fallback. They still fetch/decode the source asynchronously and size from measured
  layout. Their loading/error output and final output do not promise the same row count
  ([ASCII](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Ascii.tsx),
  [Braille](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/Braille.tsx),
  [half-block](https://github.com/endernoke/ink-picture/blob/bccf250fc1bfc0041f85138cafe40ccdde75cd76/src/components/image/HalfBlock.tsx)).
- Patches' fallback is always three rows, uses attachment metadata already in the protobuf,
  performs no network request, and is included in `measurePostRowHeight`
  ([`MediaAttachments.tsx`](../../apps/tui/src/components/MediaAttachments.tsx),
  [`post-height.ts`](../../apps/tui/src/components/post-height.ts)).

### Inferred conclusions from §3

- **Inferred:** cursor-positioned real placements reproduce the class of state Patches is
  trying to eliminate: the image's terminal position exists outside the Ink frame and
  must be continuously reconciled with it. Wrapping the component cannot convert that
  private placement mechanism into text-flow Unicode placeholders.
- **Inferred:** a child that does not re-render after an ancestor layout change can retain
  a stale position in 1.3.5. The later addition of polling is evidence that upstream also
  encountered this gap, but it is not proof of every failure mode.
- **Inferred:** React cleanup is insufficient for Patches' alternate-screen exit contract,
  and the async pre-commit path can leak terminal-side image data even during an ordinary
  unmount.
- **Inferred:** accepting arbitrary `src` values would broaden Patches' current network and
  filesystem authority. Even if Patches only passed trusted presigned URLs, complete
  buffering before validation and the vulnerable Sharp line are unacceptable for
  attacker-controlled media.
- **Inferred:** forcing only ASCII/Braille/half-block retains the vulnerable duplicate
  decoder, duplicate fetching, and protocol-dependent height while discarding the main
  reason to add the package.

## 4. Decision matrix

| Criterion               | Accepted Patches contract                    | `@patches/terminal-media` today                                                                    | `ink-picture@1.3.5`                                                  | Adoption result                                      |
| ----------------------- | -------------------------------------------- | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------- |
| Ink/React compatibility | Ink 7.1.1 / React 19                         | Native current dependency; unit-tested                                                             | Peer range installs; developed on Ink 6.8; no image test on Ink 7    | **Uncertain**, spike required                        |
| Frame ownership         | Fixed measured rows                          | Placeholder text participates in Ink layout; current inline/fallback heights still need equalizing | Flex-growing box plus out-of-band real placement                     | **Fail**                                             |
| Allowed visibility      | Selected/focused/viewer only                 | Call-site controlled; currently fallback-only                                                      | No visibility API or policy in 1.3.5                                 | **Fail**                                             |
| Position tracking       | No terminal position drift                   | Unicode cells move with text                                                                       | Yoga walk after component renders; real cursor placement             | **Fail**                                             |
| Ordinary unmount        | Explicit owner releases                      | API supports `release`; hook ownership still needs landing                                         | React-effect `d=I`; async pre-commit leak possible                   | **Fail**                                             |
| Process exit            | Explicit cleanup outside React               | Process handlers plus final `releaseAll()`                                                         | No outside-React Kitty registry/cleanup                              | **Fail**                                             |
| Live placement bound    | LRU, maximum four                            | Not yet implemented                                                                                | No registry, cap, or LRU                                             | **Fail**                                             |
| Cache                   | Bounded and session-owned                    | 100 MB disk LRU plus renderer content cache                                                        | No cache in 1.3.5                                                    | **Fail**                                             |
| Untrusted input         | Byte/pixel bounds and controlled fetch       | 10 MB/20 MP renderer bounds; authenticated media path                                              | Buffers arbitrary URL/file; no explicit bounds; Sharp <0.35 advisory | **Fail**                                             |
| Dependency fit          | One reviewed decoder line                    | Sharp 0.35.3 already approved                                                                      | Adds Sharp 0.34.5/libvips, node-fetch, Sixel, and other runtime deps | **Fail**                                             |
| Non-Kitty fallback      | Same measured height, no required fetch      | Three-row metadata box; equal-height inline work pending                                           | Decoded ASCII/Braille/half-block with variable async output          | **Fail**                                             |
| Multi-protocol reach    | Kitty required in v0; later Sixel/iTerm seam | Kitty now, interface can grow later                                                                | Kitty/Sixel/iTerm2 plus text renderers                               | **Pass**, but not enough to offset contract failures |

### Option decision

| Option                                 | Verdict       | Reason                                                                                                                                                               |
| -------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace custom renderer                | **Reject**    | Loses Unicode-placeholder positioning, bounded decoding, Patches cache, and reliable exit ownership.                                                                 |
| Wrap `ink-picture`                     | **Reject**    | A wrapper cannot access or replace 1.3.5's private image IDs, async work, placement registry, fetching, or React-only cleanup; fixing these would be a fork/rewrite. |
| Text-only use                          | **Reject**    | Variable-height output and network/decode work violate fallback parity, while the vulnerable duplicate Sharp dependency remains installed.                           |
| Reject package; finish custom contract | **Recommend** | Preserves the protocol implementation already matched to Ink 7 and limits work to the known P12-018 ownership/LRU/equal-height gaps.                                 |

## 5. Version/documentation discrepancy

### Documented facts

The claims about 16 ms polling, full/partial/hidden visibility switching, a ten-image
memory cache, and cleanup being unable to distinguish ordinary unmount from app exit
belong to the **2.1.0** documentation and source, not 1.3.5
([2.1.0 README](https://github.com/endernoke/ink-picture/blob/v2.1.0/README.md),
[2.1.0 provider defaults](https://github.com/endernoke/ink-picture/blob/v2.1.0/src/InkPictureProvider.tsx),
[2.1.0 visibility hook](https://github.com/endernoke/ink-picture/blob/v2.1.0/src/hooks/useVisibility.ts),
[2.1.0 position polling](https://github.com/endernoke/ink-picture/blob/v2.1.0/src/hooks/usePosition.ts)).
Version 2.1.0 also development-tests Ink `^7.1.0` and replaces Sharp with Jimp
([2.1.0 `package.json`](https://github.com/endernoke/ink-picture/blob/v2.1.0/package.json)).

### Inferred conclusion

- **Inferred:** an npm/GitHub landing page for the latest release was combined with 1.3.5's
  peer/dev metadata. Do not use latest-line README APIs with a 1.3.5 pin. Version 2.1.0
  would require a separate current-source evaluation; its polling and documented cleanup
  limitation still conflict with Patches' accepted event/ownership model, so it is not an
  automatic substitute.

This is not a discrepancy with `INITIAL_VISION.md`: the spec requires a Kitty renderer
seam and a non-Kitty fallback, not this dependency. No ADR is needed to reject it.

## 6. Recommendation and follow-up

**Recommendation: reject `ink-picture@1.3.5`.** Keep the existing
`TerminalMediaRenderer` seam and Unicode-placeholder protocol implementation. The package
does not address the live failure's fixed-frame and bounded-lifecycle requirements; it
adds a second, currently vulnerable native decoder and moves positioning back to
cursor-managed real placements.

Suggested implementation follow-up (outside this research agent's scope): complete the
already accepted P12-018 task in the custom code:

1. make the selected row, focused thread post, and media viewer the only placement owners;
2. give inline and fallback media one explicit, identical row budget;
3. add a renderer-level four-entry LRU with `d=I` eviction;
4. release ownership on unmount/pop, replacement, resize, overlay snapshot, and cancellation
   after an async prepare;
5. add the planned 1000-navigation test plus a real Kitty/Ghostty stress run.

No rule change or new ADR is suggested. If Sixel/iTerm2 becomes a near-term requirement,
research those protocols behind `TerminalMediaRenderer` independently rather than adopting
the rest of `ink-picture` as a bundle.

## 7. Minimal Ink 7 live spike (only if reconsidering)

Module installation/import under Ink 7 passed in isolation; real-terminal placement and
cleanup remain unverified. Run this outside the monorepo so no Patches manifest changes.
The install commands below were exercised on 2026-08-19.

```sh
SPIKE_DIR="$(mktemp -d /tmp/ink-picture-ink7.XXXXXX)"
mise exec -- pnpm --dir "$SPIKE_DIR" init --init-type module
mise exec -- pnpm --dir "$SPIKE_DIR" add --ignore-workspace \
  ink@7.1.1 react@19.2.8 ink-picture@1.3.5 tsx@4.23.12
```

Save this as `$SPIKE_DIR/spike.tsx`:

```tsx
import Image, { TerminalInfoProvider } from 'ink-picture';
import { Box, Text, render, useApp, useInput } from 'ink';
import { useState } from 'react';

const src = process.argv[2];
if (src === undefined) throw new Error('pass an absolute image path');

function App() {
  const { exit } = useApp();
  const [step, setStep] = useState(0);
  const [shown, setShown] = useState(true);

  useInput((input) => {
    if (input === 'q') exit();
    if (input === 'j' || input === 'k') setStep((value) => value + 1);
    if (input === 'x') setShown((value) => !value);
  });

  return (
    <Box flexDirection="column" width={44} height={14} overflow="hidden">
      <Text>step {step} · j/k move · x mount/unmount · q exit</Text>
      <Box marginLeft={step % 2} width={40} height={10} flexShrink={0} overflow="hidden">
        {shown ? (
          <Image src={src} protocol="kitty" width={40} height={10} alt="[image]" />
        ) : (
          <Text>[fixed 10-row fallback frame]</Text>
        )}
      </Box>
      <Text>frame end</Text>
    </Box>
  );
}

render(
  <TerminalInfoProvider>
    <App />
  </TerminalInfoProvider>,
  { alternateScreen: true },
);
```

Run it first in Kitty or Ghostty outside tmux, then through supported tmux passthrough:

```sh
mise exec -- pnpm --dir "$SPIKE_DIR" exec tsx \
  "$SPIKE_DIR/spike.tsx" /absolute/path/to/test.png
```

Do not treat a single successful render as acceptance. Hold `j`/`k` for prolonged
repositioning, toggle `x` repeatedly, resize, quit normally, send SIGTERM, and inspect for
ghosts/disappearance. Acceptance would still require an external owner proving no more
than four live IDs and explicit cleanup on every exit path—capabilities 1.3.5 does not
expose.
