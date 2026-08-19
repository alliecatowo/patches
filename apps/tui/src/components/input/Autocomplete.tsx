import stringWidth from 'string-width';
import { Box, Text, useInput, useStdin } from 'ink';
import { useEffect, useRef, useState, type ReactElement } from 'react';

const DEFAULT_DEBOUNCE_MS = 150;
const MAX_POPOVER_ROWS = 8;
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

interface LoadedItems<Item> {
  query: string;
  items: readonly Item[];
}

export type AutocompleteSource<Item> = (
  query: string,
  signal: AbortSignal,
) => Promise<readonly Item[]>;

export interface AutocompleteProps<Item> {
  /** `null` closes the controlled popover; an empty string is a valid initial query. */
  query: string | null;
  source: AutocompleteSource<Item>;
  getLabel: (item: Item) => string;
  getKey?: (item: Item) => string;
  onAccept: (item: Item) => void;
  onClose: () => void;
  columns: number;
  maxRows?: number;
  debounceMs?: number;
  isActive?: boolean;
  plain?: boolean;
  ariaLabel?: string;
}

function truncateLabel(value: string, columns: number): string {
  const width = Math.max(0, Math.trunc(columns));
  if (width === 0) return '';
  if (stringWidth(value) <= width) return value;
  if (width === 1) return '…';
  let result = '';
  for (const { segment } of graphemeSegmenter.segment(value)) {
    if (stringWidth(`${result}${segment}`) > width - 1) break;
    result += segment;
  }
  return `${result}…`;
}

/** Debounced, cancellable, keyboard-first suggestion popover. */
export function Autocomplete<Item>({
  query,
  source,
  getLabel,
  getKey,
  onAccept,
  onClose,
  columns,
  maxRows = MAX_POPOVER_ROWS,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  isActive = true,
  plain = false,
  ariaLabel = 'Autocomplete suggestions',
}: AutocompleteProps<Item>): ReactElement | null {
  const { isRawModeSupported } = useStdin();
  const sourceRef = useRef(source);
  const itemsRef = useRef<readonly Item[]>([]);
  const selectedRef = useRef(0);
  const requestRef = useRef(0);
  const [loaded, setLoaded] = useState<LoadedItems<Item> | null>(null);
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    sourceRef.current = source;
  }, [source]);

  useEffect(() => {
    requestRef.current += 1;
    const request = requestRef.current;
    itemsRef.current = [];
    selectedRef.current = 0;
    if (query === null) return undefined;

    const controller = new AbortController();
    const timer = setTimeout(
      () => {
        const load = async (): Promise<void> => {
          try {
            const nextItems = await sourceRef.current(query, controller.signal);
            if (controller.signal.aborted || requestRef.current !== request) return;
            itemsRef.current = nextItems;
            setLoaded({ query, items: nextItems });
            setSelected(0);
            selectedRef.current = 0;
          } catch (error) {
            const aborted =
              controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');
            if (aborted || requestRef.current !== request) return;
            itemsRef.current = [];
            setLoaded({ query, items: [] });
            setSelected(0);
            selectedRef.current = 0;
          }
        };
        void load();
      },
      Math.max(0, Math.trunc(debounceMs)),
    );

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [debounceMs, query]);

  const open = query !== null;
  useInput(
    (_input, key) => {
      if (key.eventType === 'release') return;
      if (key.escape) {
        onClose();
        return;
      }
      if (key.upArrow || key.downArrow) {
        const count = itemsRef.current.length;
        if (count === 0) return;
        const current = selectedRef.current;
        const next = key.upArrow ? (current - 1 + count) % count : (current + 1) % count;
        selectedRef.current = next;
        setSelected(next);
        return;
      }
      if (key.return || key.tab) {
        const item = itemsRef.current[selectedRef.current];
        if (item !== undefined) onAccept(item);
      }
    },
    { isActive: open && isActive && isRawModeSupported },
  );

  const items = loaded?.query === query ? loaded.items : [];
  if (!open || items.length === 0) return null;

  const width = Math.max(1, Math.trunc(columns));
  const rowBudget = Math.min(MAX_POPOVER_ROWS, Math.max(1, Math.trunc(maxRows)));
  const start = Math.min(
    Math.max(0, selected - rowBudget + 1),
    Math.max(0, items.length - rowBudget),
  );
  const visible = items.slice(start, start + rowBudget);
  const labelWidth = Math.max(0, width - 2);

  return (
    <Box
      aria-label={ariaLabel}
      aria-role="listbox"
      flexDirection="column"
      flexShrink={0}
      height={visible.length}
      width={width}
      overflow="hidden"
    >
      {visible.map((item, visibleIndex) => {
        const index = start + visibleIndex;
        const isSelected = index === selected;
        const label = truncateLabel(getLabel(item), labelWidth);
        return (
          <Box
            aria-role="option"
            aria-state={{ selected: isSelected }}
            flexShrink={0}
            height={1}
            width={width}
            overflow="hidden"
            key={getKey?.(item) ?? `${String(index)}:${label}`}
          >
            <Text>{isSelected ? '>' : ' '} </Text>
            <Text inverse={isSelected && !plain}>{label}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

export { MAX_POPOVER_ROWS };
export {
  applyAutocompleteSuggestion,
  findAutocompleteTrigger,
  getAutocompleteTrigger,
  insertAutocompleteSuggestion,
  isValidMentionSuggestion,
  isValidTagSuggestion,
  type AutocompleteInsertion,
  type AutocompleteTrigger,
  type AutocompleteTriggerKind,
  type InsertAutocompleteOptions,
} from './autocomplete-helpers.js';
