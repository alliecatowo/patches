import { render } from 'ink-testing-library';
import { describe, expect, it, vi } from 'vitest';

import { Autocomplete, type AutocompleteSource } from './Autocomplete.js';
import {
  findAutocompleteTrigger,
  insertAutocompleteSuggestion,
  isValidMentionSuggestion,
  isValidTagSuggestion,
} from './autocomplete-helpers.js';

const KEY = {
  up: '\u001B[A',
  down: '\u001B[B',
  enter: '\r',
  tab: '\t',
  escape: '\u001B',
} as const;

interface Deferred<Value> {
  promise: Promise<Value>;
  resolve: (value: Value) => void;
}

function deferred<Value>(): Deferred<Value> {
  let resolvePromise: ((value: Value) => void) | undefined;
  const promise = new Promise<Value>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve: (value) => resolvePromise?.(value),
  };
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

async function wait(milliseconds = 5): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

describe('autocomplete trigger and insertion helpers', () => {
  it('finds boundary-safe mention and Unicode tag prefixes', () => {
    expect(findAutocompleteTrigger('hello @ali', 10)).toEqual({
      kind: 'mention',
      marker: '@',
      start: 6,
      end: 10,
      query: 'ali',
    });
    expect(findAutocompleteTrigger('mail@example', 12)).toBeNull();
    expect(findAutocompleteTrigger('try #Café', 9)).toEqual({
      kind: 'tag',
      marker: '#',
      start: 4,
      end: 9,
      query: 'Café',
    });
    expect(findAutocompleteTrigger('word#tag', 8)).toBeNull();
  });

  it('matches the server mention/tag grammar and rejects unsafe insertion', () => {
    expect(isValidMentionSuggestion('alice_1')).toBe(true);
    expect(isValidMentionSuggestion('ab')).toBe(false);
    expect(isValidTagSuggestion('café_2026')).toBe(true);
    expect(isValidTagSuggestion('2026')).toBe(false);
    expect(isValidTagSuggestion('bad-tag')).toBe(false);

    const trigger = findAutocompleteTrigger('hello @al', 9);
    expect(trigger).not.toBeNull();
    if (trigger === null) return;
    expect(insertAutocompleteSuggestion('hello @al', trigger, '@alice')).toEqual({
      value: 'hello @alice ',
      cursor: 13,
    });
    expect(insertAutocompleteSuggestion('hello @al', trigger, 'bad name')).toBeNull();
    expect(
      insertAutocompleteSuggestion('hello @al', trigger, '@alice', { maxChars: 8 }),
    ).toBeNull();
  });

  it('replaces the whole token when the cursor is in its middle', () => {
    const value = 'say #catnip now';
    const trigger = findAutocompleteTrigger(value, 8);
    expect(trigger?.query).toBe('cat');
    if (trigger === null) return;
    expect(insertAutocompleteSuggestion(value, trigger, 'café')).toEqual({
      value: 'say #café now',
      cursor: 9,
    });
  });
});

describe('Autocomplete', () => {
  it('debounces the async source for 150ms and renders at most eight measured rows', async () => {
    const source = vi
      .fn<AutocompleteSource<string>>()
      .mockResolvedValue(
        Array.from({ length: 10 }, (_, index) => `suggestion-${String(index)}-long`),
      );
    const rendered = render(
      <Autocomplete
        query="s"
        source={source}
        getLabel={(item) => item}
        onAccept={() => undefined}
        onClose={() => undefined}
        columns={12}
        plain
      />,
    );

    await wait(140);
    expect(source).not.toHaveBeenCalled();
    await wait(20);
    await flushPromises();
    expect(source).toHaveBeenCalledOnce();
    const frame = rendered.lastFrame() ?? '';
    expect(frame.split('\n')).toHaveLength(8);
    expect(frame).toContain('> suggestio…');
    expect(frame).not.toContain('suggestion-8');
  });

  it('navigates with Up/Down and accepts with Enter or Tab', async () => {
    const accepted: string[] = [];
    const rendered = render(
      <Autocomplete
        query="a"
        source={() => Promise.resolve(['alice', 'alex', 'alix'])}
        getLabel={(item) => item}
        onAccept={(item) => accepted.push(item)}
        onClose={() => undefined}
        columns={20}
        debounceMs={0}
        plain
      />,
    );
    await wait();
    await flushPromises();

    rendered.stdin.write(KEY.down);
    rendered.stdin.write(KEY.enter);
    rendered.stdin.write(KEY.up);
    rendered.stdin.write(KEY.tab);
    expect(accepted).toEqual(['alex', 'alice']);
  });

  it('Escape closes only the popover callback and does not accept', async () => {
    const onClose = vi.fn();
    const onAccept = vi.fn();
    const rendered = render(
      <Autocomplete
        query="a"
        source={() => Promise.resolve(['alice'])}
        getLabel={(item) => item}
        onAccept={onAccept}
        onClose={onClose}
        columns={20}
        debounceMs={0}
      />,
    );
    await wait();
    rendered.stdin.write(KEY.escape);
    await wait(60);
    expect(onClose).toHaveBeenCalledOnce();
    expect(onAccept).not.toHaveBeenCalled();
  });

  it('aborts superseded requests and ignores stale resolutions', async () => {
    const first = deferred<readonly string[]>();
    const second = deferred<readonly string[]>();
    const signals: AbortSignal[] = [];
    const source: AutocompleteSource<string> = (query, signal) => {
      signals.push(signal);
      return query === 'a' ? first.promise : second.promise;
    };
    const props = {
      source,
      getLabel: (item: string) => item,
      onAccept: () => undefined,
      onClose: () => undefined,
      columns: 20,
      debounceMs: 0,
    };
    const rendered = render(<Autocomplete {...props} query="a" />);
    await wait();
    rendered.rerender(<Autocomplete {...props} query="b" />);
    await wait();
    expect(signals[0]?.aborted).toBe(true);

    second.resolve(['beta']);
    await flushPromises();
    await wait();
    expect(rendered.lastFrame()).toContain('beta');
    first.resolve(['alpha']);
    await flushPromises();
    await wait();
    expect(rendered.lastFrame()).toContain('beta');
    expect(rendered.lastFrame()).not.toContain('alpha');
  });
});
