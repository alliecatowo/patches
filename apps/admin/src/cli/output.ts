/**
 * Output formatting for `apps/admin` commands — every command supports `--json` (spec §65
 * implies this CLI is scriptable, and the brief for this task calls it out explicitly). Kept
 * deliberately tiny: a right-padded table for humans, `JSON.stringify` for scripts.
 */

/** JSON-safe: `Date`s print as ISO strings, matching what `JSON.stringify` would do to them
 * by default (`Date.prototype.toJSON`) — spelled out here only so `printTable` can format
 * them identically. */
export type Row = Record<string, string | number | boolean | null | Date>;

export function printJson(data: unknown): void {
  process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
}

/** Right-pads every column to the widest value in it, single space between columns. Empty
 * input prints nothing (not even headers) — a `list` command with no rows should be quiet,
 * not confusing. */
export function printTable(rows: readonly Row[]): void {
  if (rows.length === 0) {
    process.stdout.write('(none)\n');
    return;
  }

  const columns = Object.keys(rows[0] ?? {});
  const cells = rows.map((row) => columns.map((column) => cellText(row[column])));
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...cells.map((row) => row[index]?.length ?? 0)),
  );

  const formatRow = (values: readonly string[]): string =>
    values
      .map((value, index) => value.padEnd(widths[index] ?? 0))
      .join('  ')
      .trimEnd();

  process.stdout.write(`${formatRow(columns)}\n`);
  process.stdout.write(`${formatRow(widths.map((width) => '-'.repeat(width)))}\n`);
  for (const row of cells) {
    process.stdout.write(`${formatRow(row)}\n`);
  }
}

function cellText(value: Row[string] | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value instanceof Date) return value.toISOString();
  return String(value);
}
