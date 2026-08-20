import { fromDate } from '../api/wire/time.js';
import type { Actor } from '../api/wire/types.js';
import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import type { PatchesApi } from '../api/client.js';
import { PlainModeProvider } from '../theme/plain-mode.js';
import { EditProfileScreen } from './EditProfileScreen.js';
import { makeActor, makeNameplate } from '../test/wire-fixtures.js';

const KEY = {
  tab: '\t',
  enter: '\r',
  escape: '',
  ctrlS: '',
} as const;

function actor(overrides: Partial<Actor> = {}): Actor {
  return makeActor({
    displayName: 'Alice',
    joinedAt: fromDate(new Date()),
    nameplate: makeNameplate({ nameColor: '#ff0000' }),
    ...overrides,
  });
}

function baseApi(overrides: Partial<PatchesApi> = {}): PatchesApi {
  return {
    target: 'patches.test:50051',
    updateProfile: vi.fn().mockResolvedValue({ actor: actor() }),
    ...overrides,
  } as unknown as PatchesApi;
}

async function wait(milliseconds = 20): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Moves focus from the initial `displayName` field to `nameColor` — 4 tabs through
 * displayName → bio → location → website → nameColor (`FIELD_ORDER`). */
async function focusNameColor(stdin: { write: (data: string) => void }): Promise<void> {
  for (let index = 0; index < 4; index += 1) {
    stdin.write(KEY.tab);
    await wait(5);
  }
}

describe('EditProfileScreen nameplate colour (P12-015 wiring)', () => {
  it('opens the ColorPicker on Enter over the name colour field', async () => {
    const { stdin, lastFrame } = render(
      <EditProfileScreen
        api={baseApi()}
        actor={actor()}
        ensureAccessToken={() => Promise.resolve('token')}
        isActive
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );

    expect(lastFrame()).not.toContain('Color picker');
    await focusNameColor(stdin);
    stdin.write(KEY.enter);
    await wait();
    expect(lastFrame()).toContain('Color picker');
  });

  it('commits a picked colour and saves it under the nameplate field mask', async () => {
    // Kept as its own local (rather than read back off `api`) so the assertion below
    // isn't a `PatchesApi`-typed method reference (`@typescript-eslint/unbound-method`).
    const updateProfile = vi.fn().mockResolvedValue({ actor: actor() });
    const api = baseApi({ updateProfile });
    const { stdin, lastFrame } = render(
      <EditProfileScreen
        api={api}
        actor={actor()}
        ensureAccessToken={() => Promise.resolve('token')}
        isActive
        onCancel={() => undefined}
        onSaved={() => undefined}
      />,
    );

    await focusNameColor(stdin);
    stdin.write(KEY.enter);
    await wait();
    expect(lastFrame()).toContain('Color picker');

    // Tab into the hex field, type an exact colour, Enter commits and closes.
    stdin.write(KEY.tab);
    await wait(5);
    stdin.write('#00ff00');
    await wait(5);
    stdin.write(KEY.enter);
    await wait();
    expect(lastFrame()).not.toContain('Color picker');

    stdin.write(KEY.ctrlS);
    await vi.waitFor(() => expect(updateProfile).toHaveBeenCalledOnce());
    const [request, token] = updateProfile.mock.calls[0] as [
      { updateMask: { paths: string[] }; nameplate?: { nameColor: string } },
      string,
    ];
    expect(request.updateMask).toEqual({ paths: ['nameplate'] });
    expect(request.nameplate?.nameColor).toBe('#00ff00');
    expect(token).toBe('token');
  });

  it('Escape from the picker reverts the preview and leaves the field unchanged', async () => {
    const updateProfile = vi.fn().mockResolvedValue({ actor: actor() });
    const api = baseApi({ updateProfile });
    const onSaved = vi.fn();
    const { stdin, lastFrame } = render(
      <EditProfileScreen
        api={api}
        actor={actor()}
        ensureAccessToken={() => Promise.resolve('token')}
        isActive
        onCancel={() => undefined}
        onSaved={onSaved}
      />,
    );

    await focusNameColor(stdin);
    stdin.write(KEY.enter);
    await wait();
    stdin.write(KEY.tab);
    await wait(5);
    stdin.write('#123456');
    await wait(5);
    stdin.write(KEY.escape);
    await wait();
    expect(lastFrame()).not.toContain('Color picker');
    expect(lastFrame()).toContain('#ff0000');

    stdin.write(KEY.ctrlS);
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
    // Nothing actually changed (the revert already restored `#ff0000`) — `submit()`
    // never bothers with a round trip when the mask would be empty.
    expect(updateProfile).not.toHaveBeenCalled();
  });

  it('plain mode shows the hex value as text with no colour swatch', () => {
    const { lastFrame } = render(
      <PlainModeProvider plain>
        <EditProfileScreen
          api={baseApi()}
          actor={actor()}
          ensureAccessToken={() => Promise.resolve('token')}
          isActive
          onCancel={() => undefined}
          onSaved={() => undefined}
        />
      </PlainModeProvider>,
    );

    expect(lastFrame()).toContain('#ff0000');
    expect(lastFrame()).not.toContain('██');
  });
});
