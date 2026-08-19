import type { Nameplate as NameplateProto } from '@patches/proto/es';
import type { CSSProperties, JSX } from 'react';

import styles from './Nameplate.module.css';

export interface NameplateDisplayProps {
  handle: string;
  nameplate?: NameplateProto | undefined;
  bold?: boolean;
}

/**
 * `@handle`, optionally styled with the actor's server-attested nameplate
 * (spec §173): a colour, or a two-stop gradient written as `"#a,#b"`, plus an
 * optional single glyph. Mirrors `apps/tui/src/components/Nameplate.tsx`'s
 * degradation rule — a nameplate is never required to read a post, so this
 * renders a plain `@handle` when there isn't one. Nameplate cosmetics never
 * gate function (Amendment B §184.3) — this component only ever changes how
 * the handle looks, never what's clickable or visible.
 */
export function Nameplate({ handle, nameplate, bold = false }: NameplateDisplayProps): JSX.Element {
  const colorSpec = nameplate?.nameColor ?? '';
  const stops = colorSpec
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  const glyph = nameplate?.glyph ?? '';

  const style: CSSProperties & Record<`--${string}`, string> = { fontWeight: bold ? 700 : 600 };
  let className = styles['nameplate'] ?? '';

  if (stops.length >= 2) {
    className += ' ' + (styles['gradient'] ?? '');
    style['--nameplate-gradient'] = `linear-gradient(90deg, ${stops[0]}, ${stops[1]})`;
  } else if (stops.length === 1 && stops[0] !== undefined) {
    style.color = stops[0];
  }

  return (
    <span className={className} style={style}>
      {glyph !== '' ? (
        <span className={styles['glyph']} aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      @{handle}
    </span>
  );
}
