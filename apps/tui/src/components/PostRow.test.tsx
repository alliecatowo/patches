import { FILTER_ACTION, FILTERED_BY_PROVENANCE } from '../api/wire/enums.js';
import { fromDate } from '../api/wire/time.js';
import type { Post } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it } from 'vitest';

import { stripSgr } from '../../test/ansi.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { measurePostRowHeight } from './post-height.js';
import { PostRow } from './PostRow.js';
import {
  makeActor,
  makeCommunity,
  makeFilteredByHint,
  makeLabel,
  makeMediaAttachment,
  makePost,
  makePostCounts,
  makePostViewerState,
  makeRemoteActor,
} from '../test/wire-fixtures.js';

function post(overrides: Partial<Post> = {}): Post {
  return makePost({
    author: makeActor({ joinedAt: fromDate(new Date('2026-01-01T00:00:00.000Z')) }),
    createdAt: fromDate(new Date()),
    ...overrides,
  });
}

describe('PostRow content warnings (P3-003)', () => {
  it('renders the body directly when there is no content warning', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(lastFrame()).toContain('hello world');
  });

  it('hides the body behind the warning by default', () => {
    const { lastFrame } = render(<PostRow post={post({ contentWarning: 'spoilers' })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('spoilers');
    expect(frame).toContain('press v to reveal');
    expect(frame).not.toContain('hello world');
  });

  it('shows both the warning and the body once revealed', () => {
    const { lastFrame } = render(<PostRow post={post({ contentWarning: 'spoilers' })} revealed />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('spoilers');
    expect(frame).toContain('hello world');
    expect(frame).not.toContain('press v to reveal');
  });

  it('sanitizes control characters out of the rendered body', () => {
    const { lastFrame } = render(<PostRow post={post({ body: 'hi\x1b[2Jthere' })} />);
    expect(lastFrame()).toContain('hi[2Jthere');
  });
});

describe('PostRow media attachments (P5-003/B-004)', () => {
  it('renders nothing extra for a post with no media', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(lastFrame()).not.toContain('image ·');
  });

  it('renders the spec §75 fallback box outside a Kitty terminal/renderer context', () => {
    const withMedia = post({
      media: [makeMediaAttachment({ width: 800, height: 600, mimeType: 'image/jpeg' })],
    });
    const { lastFrame } = render(<PostRow post={withMedia} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('image · 800×600 · jpeg');
    expect(frame).toContain('press o to open externally');
  });

  it('does not render attachments behind an un-revealed content warning', () => {
    const withMedia = post({
      contentWarning: 'spoilers',
      media: [makeMediaAttachment()],
    });
    const { lastFrame } = render(<PostRow post={withMedia} />);
    expect(lastFrame() ?? '').not.toContain('image ·');
  });
});

describe('PostRow social-depth presentation (P11-009/P12-104)', () => {
  it('shows collapsed repost attribution and the viewer repost state', () => {
    const reposter = post().author;
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: reposter === undefined ? [] : [reposter],
          repostedByTotal: 3,
          counts: makePostCounts({ likes: 1, replies: 2, reposts: 3, quotes: 4 }),
          viewerState: makePostViewerState({ reposted: true }),
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @alice +2 reposted');
    expect(frame).toContain('↻ 3');
    expect(frame).toContain('❝ 4');
    expect(frame).toContain('reposted');
  });

  it('renders a quote as one bounded preview and never recursively nests it', () => {
    const nested = post({ id: 'nested', body: 'must not render recursively' });
    const quoted = post({ id: 'quoted', body: 'quoted body', quotedPost: nested });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: quoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @alice');
    expect(frame).toContain('quoted body');
    expect(frame).not.toContain('must not render recursively');
  });
});

describe('PostRow remote origin (P18-009, spec §163/§180/§192)', () => {
  it('marks a remote reposter as not local, in addition to the local case', () => {
    const local = post().author;
    const localFrame = render(
      <PostRow
        post={post({
          repostedBy: local === undefined ? [] : [local],
          repostedByTotal: 1,
        })}
      />,
    ).lastFrame();
    expect(localFrame ?? '').toContain('↻ @alice reposted');
    expect(localFrame ?? '').not.toContain('(remote)');

    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [remoteReposter],
          repostedByTotal: 1,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @quinn (remote) reposted');
  });

  it('marks only the remote reposter(s) when local and remote reposters are collapsed together', () => {
    const local = makeActor({ id: 'actor-2', handle: 'bob' });
    const remote = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [local, remote],
          repostedByTotal: 2,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bob');
    expect(frame).not.toContain('@bob (remote)');
    expect(frame).toContain('@quinn (remote)');
  });

  it("marks a remote quoted post's origin", () => {
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('quoted from another instance');
  });

  it('never recurses into a remote quote-of-a-quote even if the fixture is nested', () => {
    const deeplyNested = post({
      id: 'deep',
      body: 'must never render',
      author: makeRemoteActor({ id: 'remote-actor-2', handle: 'rae' }),
    });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'one level deep',
      author: makeRemoteActor({ handle: 'quinn' }),
      quotedPost: deeplyNested,
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('one level deep');
    expect(frame).not.toContain('must never render');
    expect(frame).not.toContain('@rae');
  });

  it('renders remote-origin markers identically in plain mode (no colour dependency)', () => {
    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow
          post={post({
            repostedBy: [remoteReposter],
            repostedByTotal: 1,
            quotedPost: remoteQuoted,
          })}
        />
      </PlainModeProvider>,
    );
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('↻ @quinn (remote) reposted');
    expect(frame).toContain('quoted @quinn (remote)');
  });
});

describe('PostRow edits and community attribution (P11-009)', () => {
  it('renders the author nameplate in feed contexts (B-129, spec §173)', () => {
    const nameplated = makeActor({
      handle: 'bob',
      nameplate: {
        $typeName: 'patches.v1.Nameplate',
        nameColor: '#FF69B4',
        glyph: '✿',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      },
    });
    const quoted = post({
      id: 'quoted',
      body: 'quoted body',
      author: nameplated,
    });
    const { lastFrame } = render(
      <PostRow post={post({ author: nameplated, quotedPost: quoted })} />,
    );
    const frame = lastFrame() ?? '';
    // The glyph renders beside both the row header's name and the quoted author's name —
    // a name appears, the nameplate appears. (The colour is SGR and stripped here; the
    // glyph proves the nameplate reached the feed row at all.)
    expect(stripSgr(frame)).toContain('✿ @bob');
    expect(stripSgr(frame).split('✿ @bob').length).toBe(3);
  });

  it('renders no nameplate decoration in plain mode', () => {
    const nameplated = makeActor({
      handle: 'bob',
      nameplate: {
        $typeName: 'patches.v1.Nameplate',
        nameColor: '#FF69B4',
        glyph: '✿',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      },
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow post={post({ author: nameplated })} />
      </PlainModeProvider>,
    );
    expect(stripSgr(lastFrame() ?? '')).not.toContain('✿');
    expect(stripSgr(lastFrame() ?? '')).toContain('@bob');
  });
});

describe('PostRow remote origin (P18-009, spec §163/§180/§192)', () => {
  it('marks a remote reposter as not local, in addition to the local case', () => {
    const local = post().author;
    const localFrame = render(
      <PostRow
        post={post({
          repostedBy: local === undefined ? [] : [local],
          repostedByTotal: 1,
        })}
      />,
    ).lastFrame();
    expect(localFrame ?? '').toContain('↻ @alice reposted');
    expect(localFrame ?? '').not.toContain('(remote)');

    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [remoteReposter],
          repostedByTotal: 1,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @quinn (remote) reposted');
  });

  it('marks only the remote reposter(s) when local and remote reposters are collapsed together', () => {
    const local = makeActor({ id: 'actor-2', handle: 'bob' });
    const remote = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [local, remote],
          repostedByTotal: 2,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bob');
    expect(frame).not.toContain('@bob (remote)');
    expect(frame).toContain('@quinn (remote)');
  });

  it("marks a remote quoted post's origin", () => {
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('quoted from another instance');
  });

  it('never recurses into a remote quote-of-a-quote even if the fixture is nested', () => {
    const deeplyNested = post({
      id: 'deep',
      body: 'must never render',
      author: makeRemoteActor({ id: 'remote-actor-2', handle: 'rae' }),
    });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'one level deep',
      author: makeRemoteActor({ handle: 'quinn' }),
      quotedPost: deeplyNested,
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('one level deep');
    expect(frame).not.toContain('must never render');
    expect(frame).not.toContain('@rae');
  });

  it('renders remote-origin markers identically in plain mode (no colour dependency)', () => {
    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow
          post={post({
            repostedBy: [remoteReposter],
            repostedByTotal: 1,
            quotedPost: remoteQuoted,
          })}
        />
      </PlainModeProvider>,
    );
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('↻ @quinn (remote) reposted');
    expect(frame).toContain('quoted @quinn (remote)');
  });
});

describe('PostRow edits and community attribution (P11-009)', () => {
  it('renders the author nameplate in feed contexts (B-129, spec §173)', () => {
    const nameplated = makeActor({
      handle: 'bob',
      nameplate: {
        $typeName: 'patches.v1.Nameplate',
        nameColor: '#FF69B4',
        glyph: '✿',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      },
    });
    const quoted = post({
      id: 'quoted',
      body: 'quoted body',
      author: nameplated,
    });
    const { lastFrame } = render(
      <PostRow post={post({ author: nameplated, quotedPost: quoted })} />,
    );
    const frame = lastFrame() ?? '';
    // The glyph renders beside both the row header's name and the quoted author's name —
    // a name appears, the nameplate appears. (The colour is SGR and stripped here; the
    // glyph proves the nameplate reached the feed row at all.)
    expect(stripSgr(frame)).toContain('✿ @bob');
    expect(stripSgr(frame).split('✿ @bob').length).toBe(3);
  });

  it('renders no nameplate decoration in plain mode', () => {
    const nameplated = makeActor({
      handle: 'bob',
      nameplate: {
        $typeName: 'patches.v1.Nameplate',
        nameColor: '#FF69B4',
        glyph: '✿',
        badges: [],
        avatarFrame: '',
        statusLine: '',
        profileBorder: '',
      },
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow post={post({ author: nameplated })} />
      </PlainModeProvider>,
    );
    expect(stripSgr(lastFrame() ?? '')).not.toContain('✿');
    expect(stripSgr(lastFrame() ?? '')).toContain('@bob');
  });
});

describe('PostRow remote origin (P18-009, spec §163/§180/§192)', () => {
  it('marks a remote reposter as not local, in addition to the local case', () => {
    const local = post().author;
    const localFrame = render(
      <PostRow
        post={post({
          repostedBy: local === undefined ? [] : [local],
          repostedByTotal: 1,
        })}
      />,
    ).lastFrame();
    expect(localFrame ?? '').toContain('↻ @alice reposted');
    expect(localFrame ?? '').not.toContain('(remote)');

    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [remoteReposter],
          repostedByTotal: 1,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('↻ @quinn (remote) reposted');
  });

  it('marks only the remote reposter(s) when local and remote reposters are collapsed together', () => {
    const local = makeActor({ id: 'actor-2', handle: 'bob' });
    const remote = makeRemoteActor({ handle: 'quinn' });
    const { lastFrame } = render(
      <PostRow
        post={post({
          repostedBy: [local, remote],
          repostedByTotal: 2,
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('@bob');
    expect(frame).not.toContain('@bob (remote)');
    expect(frame).toContain('@quinn (remote)');
  });

  it("marks a remote quoted post's origin", () => {
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('quoted from another instance');
  });

  it('never recurses into a remote quote-of-a-quote even if the fixture is nested', () => {
    const deeplyNested = post({
      id: 'deep',
      body: 'must never render',
      author: makeRemoteActor({ id: 'remote-actor-2', handle: 'rae' }),
    });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'one level deep',
      author: makeRemoteActor({ handle: 'quinn' }),
      quotedPost: deeplyNested,
    });
    const { lastFrame } = render(<PostRow post={post({ quotedPost: remoteQuoted })} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('quoted @quinn (remote)');
    expect(frame).toContain('one level deep');
    expect(frame).not.toContain('must never render');
    expect(frame).not.toContain('@rae');
  });

  it('renders remote-origin markers identically in plain mode (no colour dependency)', () => {
    const remoteReposter = makeRemoteActor({ handle: 'quinn' });
    const remoteQuoted = post({
      id: 'quoted-remote',
      body: 'quoted from another instance',
      author: makeRemoteActor({ handle: 'quinn' }),
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow
          post={post({
            repostedBy: [remoteReposter],
            repostedByTotal: 1,
            quotedPost: remoteQuoted,
          })}
        />
      </PlainModeProvider>,
    );
    const frame = stripSgr(lastFrame() ?? '');
    expect(frame).toContain('↻ @quinn (remote) reposted');
    expect(frame).toContain('quoted @quinn (remote)');
  });
});

describe('PostRow edits and community attribution (P11-009)', () => {
  it('marks edits and community attribution without changing the body', () => {
    const { lastFrame } = render(
      <PostRow
        post={post({
          editedAt: fromDate(new Date()),
          community: makeCommunity({ name: 'computers', displayName: 'Computers' }),
        })}
      />,
    );
    const frame = lastFrame() ?? '';
    expect(frame).toContain('c/computers');
    expect(frame).toContain('edited');
    expect(frame).toContain('hello world');
  });
});

describe('PostRow bounded body preview (P12-017)', () => {
  it('folds a long post into eight measured rows and expands on demand', () => {
    const long = Array.from({ length: 20 }, (_, index) => `line ${String(index)}`).join('\n');
    const folded = render(<PostRow post={post({ body: long })} width={40} />);
    expect(folded.lastFrame()).toContain('press v to expand');
    expect(folded.lastFrame()).not.toContain('line 19');
    folded.unmount();

    const expanded = render(<PostRow post={post({ body: long })} width={40} expanded />);
    expect(expanded.lastFrame()).toContain('line 19');
    expect(expanded.lastFrame()).not.toContain('press v to expand');
  });
});

describe('PostRow row rhythm (P12-104)', () => {
  it('marks the selected row with bold + accent in rich mode, no gutter character', () => {
    const { lastFrame } = render(<PostRow post={post()} selected />);
    const frame = lastFrame() ?? '';
    expect(frame).not.toContain('> @alice');
    expect(frame).toContain('@alice');
  });

  it('marks the selected row with a `> ` gutter in plain mode instead of relying on colour', () => {
    const selected = render(
      <PlainModeProvider plain>
        <PostRow post={post()} selected />
      </PlainModeProvider>,
    );
    expect(stripSgr(selected.lastFrame() ?? '')).toContain('> @alice');
    selected.unmount();

    const unselected = render(
      <PlainModeProvider plain>
        <PostRow post={post()} />
      </PlainModeProvider>,
    );
    expect(stripSgr(unselected.lastFrame() ?? '')).not.toContain('> @alice');
  });

  it('draws exactly the rows measurePostRowHeight predicts, in both rich and plain mode', () => {
    const body = '[read the announcement](https://example.com/a/very/long/path/to/the/post)';
    const target = post({ body });
    const width = 40;

    const rich = render(<PostRow post={target} width={width} />);
    const richLines = (rich.lastFrame() ?? '').split('\n').length;
    expect(richLines).toBe(measurePostRowHeight(target, width, false, false, false));
    rich.unmount();

    const plain = render(
      <PlainModeProvider plain>
        <PostRow post={target} width={width} />
      </PlainModeProvider>,
    );
    const plainLines = (plain.lastFrame() ?? '').split('\n').length;
    expect(plainLines).toBe(measurePostRowHeight(target, width, false, false, true));
  });
});

describe('PostRow filtered_by provenance (§198.3/§199.3)', () => {
  it('renders nothing extra when filtered_by is unset', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(lastFrame() ?? '').not.toContain('filtered:');
  });

  it('folds a collapse-action match behind one muted line and hides the body', () => {
    const filtered = post({
      filteredBy: makeFilteredByHint({ name: 'Spoilers' }),
    });
    const { lastFrame } = render(<PostRow post={filtered} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('filtered: Spoilers — press v to expand');
    expect(frame).not.toContain('hello world');
  });

  it('expands a collapse-action match to show the provenance line and the body', () => {
    const filtered = post({
      filteredBy: makeFilteredByHint({
        provenance: FILTERED_BY_PROVENANCE.FILTER_LIST,
        name: 'Curated blocklist',
        listOwner: makeActor({ id: 'actor-2', handle: 'moderator' }),
      }),
    });
    const { lastFrame } = render(<PostRow post={filtered} expanded />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('filtered: Curated blocklist (via @moderator)');
    expect(frame).toContain('hello world');
    expect(frame).not.toContain('press v to expand');
  });

  it('renders a warn-action match as a line above the untouched body', () => {
    const filtered = post({
      filteredBy: makeFilteredByHint({ name: 'Politics', action: FILTER_ACTION.WARN }),
    });
    const { lastFrame } = render(<PostRow post={filtered} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('filtered: Politics');
    expect(frame).toContain('hello world');
  });
});

describe('PostRow labels (spec §200.3/§203)', () => {
  it('renders nothing extra when a post has no labels', () => {
    const { lastFrame } = render(<PostRow post={post()} />);
    expect(stripSgr(lastFrame() ?? '')).not.toContain('[');
  });

  it('renders each label as a compact bracketed chip after attribution', () => {
    const labeled = post({
      labels: [
        makeLabel({ id: 'label-1', value: 'satire' }),
        makeLabel({ id: 'label-2', value: 'spoiler' }),
      ],
    });
    const { lastFrame } = render(<PostRow post={labeled} />);
    const frame = lastFrame() ?? '';
    expect(frame).toContain('[satire]');
    expect(frame).toContain('[spoiler]');
  });

  it('renders label chips in plain mode too', () => {
    const labeled = post({
      labels: [makeLabel({ id: 'label-1', value: 'satire' })],
    });
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <PostRow post={labeled} />
      </PlainModeProvider>,
    );
    expect(stripSgr(lastFrame() ?? '')).toContain('[satire]');
  });
});
