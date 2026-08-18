const UNITS: ReadonlyArray<readonly [string, number]> = [
  ['year', 365 * 24 * 60 * 60],
  ['month', 30 * 24 * 60 * 60],
  ['week', 7 * 24 * 60 * 60],
  ['day', 24 * 60 * 60],
  ['hour', 60 * 60],
  ['minute', 60],
];

/**
 * `2 minutes ago` / `just now` — the format the example layout (spec §71) uses
 * throughout the timeline. `now` is injectable so tests are not clock-dependent.
 */
export function formatRelativeTime(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 60) return 'just now';

  for (const [unit, unitSeconds] of UNITS) {
    const value = Math.floor(seconds / unitSeconds);
    if (value >= 1) return `${value} ${unit}${value === 1 ? '' : 's'} ago`;
  }
  return 'just now';
}
