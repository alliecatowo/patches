import { appendAdminAuditLog, LABEL_ACTIONS, Labeler, type LabelAction } from '@patches/database';
import { z } from 'zod';

import { booleanOption, requirePositional, type ParsedArgs } from '../cli/arg-parser.js';
import { printJson, printTable, type Row } from '../cli/output.js';
import { type AdminContext, requireOperatorUserId } from '../context.js';

/** `labeler vocabulary set-mandatory|list` (P14-026, spec §200.3, §203) — the only writer of
 * a vocabulary entry's `mandatory` flag: there is no RPC (`LabelService` never lets a labeler
 * operator, even the node itself, self-declare a value legally mandatory — see
 * `apps/server/src/modules/labels/label.service.ts`'s doc). Operates on the node's own
 * labeler only (`labelers.is_node_labeler = true`); a community/actor-owned labeler has no
 * concept of "mandatory" (§200.3 is specifically about the node's own jurisdiction-required
 * labeling, not a third-party labeler's preferences). */
export async function runLabelerCommand(
  action: string,
  args: ParsedArgs,
  context: AdminContext,
): Promise<void> {
  switch (action) {
    case 'vocabulary':
      return runVocabularyCommand(args, context);
    default:
      throw new Error(`Unknown "labeler" action "${action}". Try vocabulary.`);
  }
}

async function runVocabularyCommand(args: ParsedArgs, context: AdminContext): Promise<void> {
  const subaction = args.positionals[2];
  switch (subaction) {
    case 'set-mandatory':
      return setMandatory(args, context);
    case 'list':
      return listVocabulary(args, context);
    default:
      throw new Error(
        `Unknown "labeler vocabulary" action "${String(subaction)}". Try set-mandatory or list.`,
      );
  }
}

/** Mirrors `apps/server/src/modules/labels/label-validation.ts`'s `storedVocabularyEntrySchema`
 * — duplicated rather than imported, since `apps/admin` never depends on `apps/server` (each
 * app owns its own boundary validation of the same `labelers.vocabulary` jsonb shape, the same
 * layering `docs/agents/PACKAGE_CONVENTIONS.md` draws between every app). */
const vocabularyEntrySchema = z.object({
  value: z.string(),
  description: z.string(),
  defaultAction: z.enum(LABEL_ACTIONS),
  mandatory: z.boolean(),
});
const storedVocabularySchema = z.array(vocabularyEntrySchema);

interface StoredVocabularyEntry {
  value: string;
  description: string;
  defaultAction: LabelAction;
  mandatory: boolean;
}

async function requireNodeLabeler(context: AdminContext): Promise<Labeler> {
  const labeler = await context.dataSource
    .getRepository(Labeler)
    .findOne({ where: { isNodeLabeler: true } });
  if (labeler === null) {
    throw new Error(
      'No node labeler found. Boot the server at least once (it seeds the node’s own ' +
        'labeler from LABEL_VOCABULARY on startup) before running this command.',
    );
  }
  return labeler;
}

function parseStoredVocabulary(raw: unknown): StoredVocabularyEntry[] {
  const result = storedVocabularySchema.safeParse(raw);
  if (!result.success) {
    throw new Error('Stored labeler vocabulary is malformed.');
  }
  return result.data;
}

async function setMandatory(args: ParsedArgs, context: AdminContext): Promise<void> {
  const value = requirePositional(
    args.positionals,
    3,
    'Usage: labeler vocabulary set-mandatory <value> [--off]',
  ).trim();
  const mandatory = !booleanOption(args.options, 'off');
  const operatorUserId = await requireOperatorUserId(context);

  await context.dataSource.transaction(async (manager) => {
    const labelers = manager.getRepository(Labeler);
    const labeler = await labelers.findOne({ where: { isNodeLabeler: true } });
    if (labeler === null) {
      throw new Error(
        'No node labeler found. Boot the server at least once (it seeds the node’s own ' +
          'labeler from LABEL_VOCABULARY on startup) before running this command.',
      );
    }
    const vocabulary = parseStoredVocabulary(labeler.vocabulary);
    const entry = vocabulary.find((candidate) => candidate.value === value);
    if (entry === undefined) {
      throw new Error(
        `"${value}" is not part of the node labeler's vocabulary. Known values: ` +
          `${vocabulary.map((candidate) => candidate.value).join(', ') || '(none)'}.`,
      );
    }
    // Idempotent, same reasoning `domain.ts#blockDomain` documents: re-running this with the
    // same effective value still writes a fresh audit row rather than short-circuiting — a
    // repeated confirmation of a legally mandatory value is itself worth recording.
    entry.mandatory = mandatory;
    labeler.vocabulary = vocabulary;
    await labelers.save(labeler);

    await appendAdminAuditLog(manager, {
      adminUserId: operatorUserId,
      action: 'labeler.vocabulary.set-mandatory',
      subjectType: 'LABELER',
      subjectId: labeler.id,
      metadata: { value, mandatory },
    });
  });

  process.stdout.write(`"${value}" is now ${mandatory ? 'mandatory' : 'not mandatory'}.\n`);
}

async function listVocabulary(args: ParsedArgs, context: AdminContext): Promise<void> {
  const labeler = await requireNodeLabeler(context);
  const vocabulary = parseStoredVocabulary(labeler.vocabulary);

  const table: Row[] = vocabulary.map((entry) => ({
    value: entry.value,
    description: entry.description,
    defaultAction: entry.defaultAction,
    mandatory: entry.mandatory,
  }));

  if (booleanOption(args.options, 'json')) {
    printJson(table);
  } else {
    printTable(table);
  }
}
