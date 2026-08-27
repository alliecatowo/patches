/**
 * ADR 0020 §13/§12.11: no key, prekey, envelope, roster, report, or DM delivery path may cross
 * `FederationGateway`, even once federation is enabled for other content
 * (`docs/architecture/e2ee.md` §10). `grep -rln FederationGateway apps/server/src/modules/e2ee`
 * being empty today is not a guarantee it stays empty — this file makes the seam a checked
 * invariant, not a fact someone has to remember to re-verify by hand.
 *
 * Two independent proofs:
 *
 * 1. Static import-graph check (this file's own directory + `packages/domain/src/e2ee`, and
 *    separately the federation module) — modeled on `apps/web/src/e2ee/import-graph.test.ts`,
 *    but non-transitive: it only inspects each module's *own* import specifiers, not a followed
 *    graph, since both directions only need "does this file's source text mention the other
 *    side," not "does importing this file eventually pull the other side in transitively."
 * 2. Runtime check: `E2eeModule`'s only DI graph (its controller + application services) never
 *    references the `FEDERATION_GATEWAY` token. Confirmed two ways: (a) resolving that token from
 *    a testing module built from exactly the controller + its real service tokens throws
 *    (nothing in the graph provides it), and (b) even when a spy is force-registered under that
 *    token in the same testing module, exercising `getE2EeCapability` and the `sendEnvelopes`
 *    write path (the same paths `e2ee.controller.test.ts` exercises) never calls it — proving
 *    the controller and its real collaborators hold no reference to the gateway to call in the
 *    first place, not merely that nothing happened to call it this run.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { Test } from '@nestjs/testing';
import {
  E2eeCapabilityState,
  type GetE2eeCapabilityResponse,
  type SendEnvelopesResponse,
} from '@patches/proto/nest';
import { describe, expect, it, vi } from 'vitest';

import { AuthGuard } from '../auth/auth.guard.js';
import { RequirePrivacyAckGuard } from '../../common/guards/require-privacy-ack.guard.js';
import type { FederationGateway } from '../federation/federation-gateway.js';
import { FEDERATION_GATEWAY } from '../federation/federation-gateway.js';
import { E2eeCapabilityService } from './e2ee-capability.service.js';
import { E2eeConversationService } from './e2ee-conversation.service.js';
import { E2eeDeviceLinkService } from './device-link.service.js';
import { E2eeDeviceRosterService } from './device-roster.service.js';
import { E2eeController } from './e2ee.controller.js';
import { E2eeGroupService } from './group-control.service.js';
import { E2eeIdentityRootService } from './identity-root.service.js';
import { E2eePrekeyService } from './prekey.service.js';
import { E2eeReportEvidenceService } from './report-evidence.service.js';

// apps/server builds to CommonJS (`.claude/rules/server.md`) — `__filename`/`__dirname`, not
// `import.meta.url`, which is a CJS build error (TS1470).
const THIS_FILE = __filename;
const E2EE_DIR = dirname(THIS_FILE);
const DOMAIN_E2EE_DIR = resolve(E2EE_DIR, '../../../../../packages/domain/src/e2ee');
const FEDERATION_DIR = resolve(E2EE_DIR, '../federation');

const FEDERATION_REFERENCE_PATTERN = /federation/i;
const SPECIFIER_PATTERN =
  /\bfrom\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|^\s*import\s+['"]([^'"]+)['"]/gm;

/** All `.ts` files directly under `dir` and any subdirectory, excluding this file itself and
 * `.test.ts`/`.spec.ts` files — tests are allowed to reference either side to build fixtures
 * (e.g. this file), only production source is constrained. */
function listSourceFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listSourceFilesRecursive(full));
      continue;
    }
    if (!entry.name.endsWith('.ts')) continue;
    if (/\.(test|spec)\.ts$/.test(entry.name)) continue;
    if (full === THIS_FILE) continue;
    files.push(full);
  }
  return files;
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const specifiers: string[] = [];
  for (const match of source.matchAll(SPECIFIER_PATTERN)) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier !== undefined) specifiers.push(specifier);
  }
  return specifiers;
}

interface Violation {
  readonly file: string;
  readonly specifier: string;
}

function findMatchingImports(files: readonly string[], pattern: RegExp): Violation[] {
  const violations: Violation[] = [];
  for (const file of files) {
    for (const specifier of importSpecifiers(file)) {
      if (pattern.test(specifier)) violations.push({ file, specifier });
    }
  }
  return violations;
}

describe('E2EE / federation import-graph isolation (ADR 0020 §13)', () => {
  it('no e2ee module source file imports anything federation-related', () => {
    const files = listSourceFilesRecursive(E2EE_DIR);
    expect(files.length).toBeGreaterThan(0);

    expect(findMatchingImports(files, FEDERATION_REFERENCE_PATTERN)).toEqual([]);
  });

  it('no packages/domain e2ee source file imports anything federation-related', () => {
    const files = listSourceFilesRecursive(DOMAIN_E2EE_DIR);
    expect(files.length).toBeGreaterThan(0);

    expect(findMatchingImports(files, FEDERATION_REFERENCE_PATTERN)).toEqual([]);
  });

  it('no federation module source file imports from the e2ee module or @patches/crypto', () => {
    const files = listSourceFilesRecursive(FEDERATION_DIR);
    expect(files.length).toBeGreaterThan(0);

    const e2eeImportPattern = /e2ee|@patches\/crypto/i;
    expect(findMatchingImports(files, e2eeImportPattern)).toEqual([]);
  });
});

function stubCapability(): E2eeCapabilityService {
  return {
    getCapability: (): GetE2eeCapabilityResponse => ({
      capability: {
        state: E2eeCapabilityState.E2EE_CAPABILITY_STATE_ENABLED,
        supportedProtocolVersions: ['patches-e2ee-v1'],
        maxActiveDevicesPerActor: 64,
        maxGroupMembers: 8,
        oneTimePrekeyTarget: 100,
        oneTimePrekeyReplenishThreshold: 20,
        signedPrekeyRotationSeconds: 604_800,
        mailboxMaxLatencySeconds: 2_592_000,
        maxEnvelopeBytes: 65_536,
        maxReportContextMessages: 10,
        frankingProfile: 'patches-franking-v1',
        postQuantum: false,
      },
    }),
  } as unknown as E2eeCapabilityService;
}

describe('E2eeController runtime never reaches FederationGateway (ADR 0020 §13)', () => {
  it('has no provider for FEDERATION_GATEWAY in its own DI graph', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [E2eeController],
      providers: [
        { provide: E2eeIdentityRootService, useValue: {} },
        { provide: E2eeDeviceRosterService, useValue: {} },
        { provide: E2eeDeviceLinkService, useValue: {} },
        { provide: E2eePrekeyService, useValue: {} },
        { provide: E2eeConversationService, useValue: {} },
        { provide: E2eeGroupService, useValue: {} },
        { provide: E2eeReportEvidenceService, useValue: {} },
        { provide: E2eeCapabilityService, useValue: stubCapability() },
      ],
    })
      // `@UseGuards(AuthGuard)`/`@UseGuards(RequirePrivacyAckGuard)` need real class instances
      // resolvable at compile time (their own dependencies — `TokenService`, `DataSource` —
      // aren't relevant to this test); `overrideGuard` swaps them for a pass-through without
      // requiring the rest of `AuthModule`'s DI graph.
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RequirePrivacyAckGuard)
      .useValue({ canActivate: () => true })
      .compile();

    expect((): unknown => moduleRef.get(FEDERATION_GATEWAY, { strict: false })).toThrow();
  });

  it('never calls a force-registered FederationGateway spy for a capability read or an envelope send', async () => {
    const sendEnvelopes = (): Promise<SendEnvelopesResponse> =>
      Promise.resolve({
        logicalMessageId: 'message-1',
        acceptedAt: undefined,
        frankingTag: undefined,
        fanoutDigest: Buffer.alloc(0),
        acceptedRecipientDeviceIds: [],
      });
    const gatewaySpy: FederationGateway = {
      publishPost: vi.fn(() => Promise.resolve()),
      publishDelete: vi.fn(() => Promise.resolve()),
      followRemoteActor: vi.fn(() => Promise.resolve()),
      unfollowRemoteActor: vi.fn(() => Promise.resolve()),
      likeRemotePost: vi.fn(() => Promise.resolve()),
      unlikeRemotePost: vi.fn(() => Promise.resolve()),
      announceRemotePost: vi.fn(() => Promise.resolve()),
      unannounceRemotePost: vi.fn(() => Promise.resolve()),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [E2eeController],
      providers: [
        { provide: E2eeIdentityRootService, useValue: {} },
        { provide: E2eeDeviceRosterService, useValue: {} },
        { provide: E2eeDeviceLinkService, useValue: {} },
        { provide: E2eePrekeyService, useValue: {} },
        {
          provide: E2eeConversationService,
          useValue: { sendEnvelopes },
        },
        { provide: E2eeGroupService, useValue: {} },
        { provide: E2eeReportEvidenceService, useValue: {} },
        { provide: E2eeCapabilityService, useValue: stubCapability() },
        // Force the token into this graph even though production wiring never provides it, so a
        // future accidental `@Inject(FEDERATION_GATEWAY)` on a real collaborator would show up
        // here as an unexpected call rather than silently having nothing to call.
        { provide: FEDERATION_GATEWAY, useValue: gatewaySpy },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RequirePrivacyAckGuard)
      .useValue({ canActivate: () => true })
      .compile();

    const controller = moduleRef.get(E2eeController);

    await controller.getE2EeCapability({});
    await controller.sendEnvelopes(
      {
        conversationId: 'conversation-1',
        clientRequestId: 'client-request-1',
        senderDeviceId: 'device-1',
        message: undefined,
      },
      undefined,
      {
        userId: 'user-1',
        actorId: 'actor-1',
        sessionId: 'session-1',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    );

    for (const method of Object.values(gatewaySpy)) {
      expect(method).not.toHaveBeenCalled();
    }
  });
});
