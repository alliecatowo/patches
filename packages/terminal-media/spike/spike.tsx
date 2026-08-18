/**
 * The §74 image-rendering technical spike.
 *
 * Run interactively:   pnpm --filter @patches/terminal-media spike
 * Non-interactive:     pnpm --filter @patches/terminal-media spike -- --report
 *
 * See spike/README.md for the manual test checklist mapping to §74's seven points.
 */
import { Box, Text, render, useApp, useInput, useWindowSize } from 'ink';
import { useCallback, useEffect, useState, type ReactNode } from 'react';

import {
  InlineImage,
  MediaRendererProvider,
  createRenderer,
  detectTerminalGraphics,
  installMediaCleanup,
  type GraphicsCapabilities,
  type PreparedImage,
  type TerminalMediaRenderer,
} from '../src/index.js';
import { makeTestImages, type TestImage } from './images.js';

interface Post {
  readonly author: string;
  readonly handle: string;
  readonly body: string;
}

const POSTS: readonly Post[] = [
  { author: 'Allison', handle: '@allison', body: 'shipped the kitty graphics spike today' },
  { author: 'Rae', handle: '@rae', body: 'terminal-native social network, no algorithm' },
  { author: 'Kit', handle: '@kit', body: 'unicode placeholders are quietly brilliant' },
  { author: 'Moss', handle: '@moss', body: 'chronological or nothing' },
  { author: 'Juno', handle: '@juno', body: 'a 64px thumbnail is still an image' },
  { author: 'Pip', handle: '@pip', body: 'resize the window, watch it reflow' },
];

/** Rows of chrome per post: 2 border + 2 text lines. */
const POST_CHROME_ROWS = 4;
/** Rows reserved for the header and the status bar. */
const APP_CHROME_ROWS = 4;

interface SpikeProps {
  renderer: TerminalMediaRenderer;
  images: readonly TestImage[];
  caps: GraphicsCapabilities;
}

function Spike({ renderer, images, caps }: SpikeProps): ReactNode {
  const { columns, rows } = useWindowSize();
  const { exit } = useApp();

  const [selected, setSelected] = useState(0);
  const [rerenders, setRerenders] = useState(0);
  const [deleted, setDeleted] = useState<ReadonlySet<number>>(new Set());
  const [prepared, setPrepared] = useState<ReadonlyMap<number, PreparedImage>>(new Map());
  const [error, setError] = useState<string | undefined>(undefined);

  // Image geometry is derived from the live window size, so a resize re-runs the effect
  // below and re-prepares at the new cell budget (§74.6).
  const imageRows = renderer.kind === 'kitty' ? 5 : 3;
  const maxCols = Math.max(8, Math.min(columns - 6, 48));
  const postRows = imageRows + POST_CHROME_ROWS;
  const visibleCount = Math.max(
    1,
    Math.min(POSTS.length, Math.floor((rows - APP_CHROME_ROWS) / postRows)),
  );
  const offset = Math.max(0, Math.min(selected - visibleCount + 1, POSTS.length - visibleCount));

  useEffect(() => {
    let cancelled = false;
    const run = async (): Promise<void> => {
      const next = new Map<number, PreparedImage>();
      for (const [index, image] of images.entries()) {
        if (deleted.has(index)) continue;
        next.set(
          index,
          await renderer.prepare(
            { bytes: image.bytes, mime: image.mime },
            { maxCols, maxRows: imageRows },
          ),
        );
      }
      if (!cancelled) setPrepared(next);
    };
    run().catch((cause: unknown) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      cancelled = true;
    };
  }, [renderer, images, maxCols, imageRows, deleted]);

  const toggleDeleted = useCallback(() => {
    setDeleted((current) => {
      const next = new Set(current);
      if (next.has(selected)) {
        next.delete(selected);
      } else {
        const image = prepared.get(selected);
        if (image) renderer.release(image);
        next.add(selected);
      }
      return next;
    });
  }, [prepared, renderer, selected]);

  useInput((input, key) => {
    if (input === 'q' || (key.ctrl && input === 'c')) {
      exit();
      return;
    }
    if (input === 'j' || key.downArrow) setSelected((s) => Math.min(POSTS.length - 1, s + 1));
    if (input === 'k' || key.upArrow) setSelected((s) => Math.max(0, s - 1));
    if (input === 'R') setRerenders((n) => n + 1);
    if (input === 'd') toggleDeleted();
  });

  const cell =
    caps.cellWidthPx !== undefined && caps.cellHeightPx !== undefined
      ? `${caps.cellWidthPx}x${caps.cellHeightPx}px`
      : 'unknown';

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      <Box justifyContent="space-between" width={columns}>
        <Text bold>patches · terminal-media spike</Text>
        <Text dimColor>
          {renderer.kind} · cell {cell} · {columns}x{rows} · rerenders {rerenders}
        </Text>
      </Box>

      {error !== undefined && <Text color="red">prepare failed: {error}</Text>}

      <Box flexDirection="column" flexGrow={1}>
        {POSTS.slice(offset, offset + visibleCount).map((post, windowIndex) => {
          const index = offset + windowIndex;
          const image = prepared.get(index);
          return (
            <Box
              key={post.handle}
              flexDirection="column"
              borderStyle="round"
              borderColor={index === selected ? 'cyan' : 'gray'}
              paddingX={1}
              width={maxCols + 4}
              flexShrink={0}
            >
              <Text>
                <Text bold>{post.author}</Text> <Text dimColor>{post.handle}</Text>
              </Text>
              <Text wrap="truncate-end">{post.body}</Text>
              {image ? (
                <InlineImage image={image} />
              ) : (
                <Text dimColor>[image released — press d to restore]</Text>
              )}
            </Box>
          );
        })}
      </Box>

      <Text dimColor>
        j/k select · d release/restore image · R force rerender · q quit
        {'  '}
        {images[selected]?.label ?? ''}
      </Text>
    </Box>
  );
}

async function main(): Promise<void> {
  const wantsReport = process.argv.includes('--report');

  // The probe MUST happen before render(): Ink owns stdin afterwards.
  const caps = await detectTerminalGraphics();

  if (wantsReport) {
    process.stdout.write(`${JSON.stringify(caps, null, 2)}\n`);
    return;
  }

  if (!process.stdout.isTTY) {
    process.stderr.write(
      'patches spike: stdout is not a TTY — nothing to draw. Use --report for capabilities.\n',
    );
    process.exitCode = 1;
    return;
  }

  const renderer = createRenderer(caps, process.stdout);
  const images = await makeTestImages();

  process.stderr.write(
    `[patches spike] kitty=${String(caps.kitty)} renderer=${renderer.kind} cell=${
      caps.cellWidthPx ?? '?'
    }x${caps.cellHeightPx ?? '?'}px size=${caps.columns}x${caps.rows} term="${caps.termHint}"\n`,
  );

  const app = render(
    <MediaRendererProvider renderer={renderer}>
      <Spike renderer={renderer} images={images} caps={caps} />
    </MediaRendererProvider>,
    {
      alternateScreen: true,
      exitOnCtrlC: false,
      incrementalRendering: true,
    },
  );

  // Signal-time and exit-time cleanup lives outside React: Ink discards writes made
  // during alternate-screen teardown, so a React effect cleanup would be thrown away.
  const disposeCleanup = installMediaCleanup(renderer, { onSignal: () => app.unmount() });

  await app.waitUntilExit();
  renderer.releaseAll();
  disposeCleanup();
  // Belt and braces: make sure the cursor is visible whatever Ink did on the way out.
  process.stdout.write('\x1b[?25h');
}

await main();
