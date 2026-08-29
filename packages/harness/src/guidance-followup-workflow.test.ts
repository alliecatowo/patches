import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Static guard for issue #382 ("empower agents to file follow-up issues and update the
 * board"). The canonical OpenCode execution-loop/packet/handoff guidance and its mirrored
 * `.claude/skills` files commit to a concrete worker filing workflow; this cheap test reads
 * those files (and the two `docs/agents` files that describe the flow) and asserts each
 * load-bearing marker is present. It is a substring check, not prose understanding — it only
 * catches a marker going missing, which is exactly the regression a follow-up-filing rule
 * could silently lose when the guidance next gets rewritten.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/**
 * File -> the markers that file must contain to keep the filing workflow intact.
 * `name` names the file for a readable assertion; `markers` are substrings that must appear.
 */
const GUIDANCE: ReadonlyArray<{ name: string; markers: readonly string[] }> = [
  // Canonical OpenCode skills.
  {
    name: join(root, '.opencode', 'skills', 'packet', 'SKILL.md'),
    markers: ['gh issue create --repo alliecatowo/patches', 'the URL in the handoff'],
  },
  {
    name: join(root, '.opencode', 'skills', 'handoff', 'SKILL.md'),
    markers: [
      'Follow-ups:',
      'gh issue create --repo alliecatowo/patches',
      'Project #5',
      'scope',
      'evidence',
      'acceptance',
      'labels',
      'least privilege and secret safety',
    ],
  },
  {
    name: join(root, '.opencode', 'skills', 'execution-loop', 'SKILL.md'),
    markers: ['Follow-ups:', 'Project #5', 'never edit a board item a worker didn'],
  },
  // Mirrored agent guidance.
  {
    name: join(root, '.claude', 'skills', 'packet', 'SKILL.md'),
    markers: ['gh issue create --repo alliecatowo/patches', 'the URL in the handoff'],
  },
  {
    name: join(root, '.claude', 'skills', 'handoff', 'SKILL.md'),
    markers: [
      'Follow-ups:',
      'gh issue create --repo alliecatowo/patches',
      'Project #5',
      'scope',
      'evidence',
      'acceptance',
      'labels',
      'least privilege and secret safety',
    ],
  },
  // docs/agents describe the same flow at a higher level.
  {
    name: join(root, 'docs', 'agents', 'HARNESS.md'),
    markers: [
      'add it to Project #5',
      'one issue per follow-up',
      'do not create work by guessing',
      'never put secrets into an issue',
    ],
  },
  {
    name: join(root, 'docs', 'agents', 'HETEROGENEOUS.md'),
    markers: [
      'follow-ups (issue URLs)',
      'gh issue create --repo alliecatowo/patches',
      'Project #5',
    ],
  },
];

describe('guidance contains the follow-up filing workflow (#382)', () => {
  it.each(GUIDANCE)('$name keeps every filing marker', ({ name, markers }) => {
    const content = readFileSync(name, 'utf8');
    for (const marker of markers) {
      expect(content, `${marker} not found in ${name}`).toContain(marker);
    }
  });

  it('all guidance files resolved (guards against wrong paths / empty reads)', () => {
    for (const { name } of GUIDANCE) {
      expect(readFileSync(name, 'utf8').length).toBeGreaterThan(0);
    }
  });
});
