import type { JSX } from 'react';

import { useSystemPrefersDark, useTheme } from '../../hooks/useTheme.js';
import type { ThemePreference } from '../../lib/theme.js';
import formStyles from '../AuthForm.module.css';
import styles from './AppearanceSettingsRoute.module.css';

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string }> = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Follow system' },
];

/**
 * `/settings/appearance` (P15-008) — the settings surface for client-side cosmetic
 * preferences. Theme is the first (and today, only) one: stored locally via `lib/theme.ts`
 * and never sent to the server, since appearance is purely cosmetic and cosmetics never gate
 * function (spec §184.3). If more client-only preferences are added later, they belong here.
 */
export function AppearanceSettingsRoute(): JSX.Element {
  const { preference, setPreference } = useTheme();
  const systemPrefersDark = useSystemPrefersDark();

  return (
    <div className={formStyles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Appearance</h1>

      <section>
        <h2>Theme</h2>
        <div className={styles['options']} role="radiogroup" aria-label="Theme">
          {THEME_OPTIONS.map((option) => (
            <label key={option.value} className={styles['option']}>
              <input
                type="radio"
                name="theme"
                value={option.value}
                checked={preference === option.value}
                onChange={() => setPreference(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className={styles['hint']}>
          {preference === 'system'
            ? `Following your system setting — currently ${systemPrefersDark ? 'dark' : 'light'}.`
            : 'Saved on this device only; never sent to the server.'}
        </p>
      </section>
    </div>
  );
}
