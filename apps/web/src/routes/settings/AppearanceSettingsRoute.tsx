import type { JSX } from 'react';
import { Link } from 'react-router-dom';

import { CheckIcon, DownloadIcon, SparklesIcon } from '../../components/icons/Icons.js';
import { useInterfacePreferences } from '../../hooks/useInterfacePreferences.js';
import {
  requestShakeToReportPermission,
  shakeToReportRequiresGesturePermission,
  useShakeReportPermission,
} from '../../hooks/useShakeToReport.js';
import { useSystemPrefersDark, useTheme } from '../../hooks/useTheme.js';
import { THEME_CATALOG } from '../../lib/theme.js';
import { useAppBadgeStatus } from '../../pwa/appBadgeStatus.js';
import { usePwaInstall } from '../../pwa/usePwaInstall.js';
import formStyles from '../AuthForm.module.css';
import styles from './AppearanceSettingsRoute.module.css';

/**
 * `/settings/appearance` — theme customization & PWA installation settings.
 * Supports the complete Patches theme catalog with live swatch cards.
 */
export function AppearanceSettingsRoute(): JSX.Element {
  const { preference, setPreference } = useTheme();
  const { fanStyle, density, setFanStyle, setDensity } = useInterfacePreferences();
  const systemPrefersDark = useSystemPrefersDark();
  const { isInstallable, isStandalone, isIos, promptInstall } = usePwaInstall();
  const appBadgeStatus = useAppBadgeStatus();
  const shakePermission = useShakeReportPermission();
  const shakeNeedsGesture = shakeToReportRequiresGesturePermission();

  const appBadgeDescription =
    appBadgeStatus.capability === 'unsupported'
      ? 'App icon badges are not available in this browser.'
      : appBadgeStatus.operation === 'failed'
        ? 'This browser exposes app icon badges, but the last badge update was not accepted.'
        : appBadgeStatus.operation === 'applied' || appBadgeStatus.operation === 'cleared'
          ? 'This browser accepted the last app icon badge update.'
          : 'This browser exposes app icon badges; no badge update has run yet.';

  return (
    <div className={formStyles['wrap']} style={{ margin: 0, maxWidth: 'none' }}>
      <h1>Appearance</h1>

      <section>
        <div className={styles['sectionTitleRow']}>
          <SparklesIcon size={18} />
          <h2>Theme</h2>
        </div>

        <div className={styles['themeGrid']} role="radiogroup" aria-label="Theme">
          {THEME_CATALOG.map((theme) => {
            const isSelected = preference === theme.id;
            return (
              <label
                key={theme.id}
                className={`${styles['themeCard']} ${isSelected ? styles['themeCardSelected'] : ''}`}
                style={{
                  backgroundColor: theme.preview.bg,
                  color: theme.preview.fg,
                  borderColor: isSelected ? 'var(--accent)' : theme.preview.border,
                }}
              >
                <input
                  type="radio"
                  name="theme"
                  value={theme.id}
                  aria-label={theme.name}
                  checked={isSelected}
                  onChange={() => setPreference(theme.id)}
                  className={styles['radioInput']}
                />
                <div className={styles['themeCardContent']}>
                  <div className={styles['themeCardTop']}>
                    <span className={styles['themeName']}>{theme.name}</span>
                    {isSelected ? (
                      <span className={styles['checkBadge']}>
                        <CheckIcon size={14} />
                      </span>
                    ) : null}
                  </div>
                  <p className={styles['themeDesc']} style={{ color: theme.preview.fg }}>
                    {theme.description}
                  </p>
                  <div className={styles['swatchPreview']}>
                    <span
                      className={styles['swatchBox']}
                      style={{ backgroundColor: theme.preview.accent }}
                      title="Accent color"
                    />
                    <span
                      className={styles['swatchBox']}
                      style={{ backgroundColor: theme.preview.border }}
                      title="Border color"
                    />
                    <span
                      className={styles['swatchBox']}
                      style={{ backgroundColor: theme.preview.fg }}
                      title="Text color"
                    />
                  </div>
                </div>
              </label>
            );
          })}
        </div>

        <p className={styles['hint']}>
          {preference === 'system'
            ? `Following your system setting — currently ${systemPrefersDark ? 'dark' : 'light'}.`
            : 'Saved on this device only; never sent to the server.'}
        </p>
      </section>

      <section className={styles['preferencesSection']}>
        <div className={styles['sectionTitleRow']}>
          <SparklesIcon size={18} />
          <h2>Layout</h2>
        </div>
        <fieldset className={styles['choiceGroup']}>
          <legend>Quick menu</legend>
          <label>
            <input
              type="radio"
              name="fan-style"
              checked={fanStyle === 'stacked'}
              onChange={() => setFanStyle('stacked')}
            />
            Stacked (default)
          </label>
          <label>
            <input
              type="radio"
              name="fan-style"
              checked={fanStyle === 'radial'}
              onChange={() => setFanStyle('radial')}
            />
            Radial fan
          </label>
        </fieldset>
        <fieldset className={styles['choiceGroup']}>
          <legend>Timeline density</legend>
          <label>
            <input
              type="radio"
              name="density"
              checked={density === 'cozy'}
              onChange={() => setDensity('cozy')}
            />
            Cozy (default)
          </label>
          <label>
            <input
              type="radio"
              name="density"
              checked={density === 'compact'}
              onChange={() => setDensity('compact')}
            />
            Compact
          </label>
        </fieldset>
        <p className={styles['hint']}>
          Saved on this device only. Density changes spacing, never text size or available actions.
        </p>
      </section>

      <section style={{ marginTop: '2rem' }}>
        <div className={styles['sectionTitleRow']}>
          <DownloadIcon size={18} />
          <h2>Progressive Web App</h2>
        </div>

        <div className={styles['pwaCard']}>
          {isStandalone ? (
            <div>
              <strong style={{ color: 'var(--ok)' }}>✓ Patches is installed as a PWA</strong>
              <p className={styles['pwaDesc']}>
                Running in standalone mode with the offline shell.
              </p>
            </div>
          ) : isInstallable ? (
            <div>
              <strong>Install Patches to your device</strong>
              <p className={styles['pwaDesc']}>
                Get native standalone window, offline caching, and faster load times.
              </p>
              <button
                type="button"
                className={styles['pwaInstallBtn']}
                onClick={() => void promptInstall()}
              >
                Install Patches App
              </button>
            </div>
          ) : isIos ? (
            <div>
              <strong>Install on iOS Safari</strong>
              <p className={styles['pwaDesc']}>
                Tap the Share button ⎋ in Safari, then select <strong>Add to Home Screen</strong>.
              </p>
            </div>
          ) : (
            <div>
              <strong>Web Client Ready</strong>
              <p className={styles['pwaDesc']}>
                Service worker caching and offline navigation are active in this browser.
              </p>
            </div>
          )}
          <p className={styles['pwaDesc']}>
            {appBadgeDescription} Actual icon display depends on the installed app, browser, and
            operating system.
          </p>
        </div>
      </section>

      {shakeNeedsGesture ? (
        <section style={{ marginTop: '2rem' }}>
          <div className={styles['sectionTitleRow']}>
            <SparklesIcon size={18} />
            <h2>Shake to report</h2>
          </div>

          <div className={styles['pwaCard']}>
            {shakePermission === 'granted' ? (
              <div>
                <strong style={{ color: 'var(--ok)' }}>✓ Shake to report is enabled</strong>
                <p className={styles['pwaDesc']}>
                  Shake your device to jump straight to the report screen.
                </p>
              </div>
            ) : (
              <div>
                <strong>
                  {shakePermission === 'denied'
                    ? 'Shake to report is off'
                    : 'Enable shake to report'}
                </strong>
                <p className={styles['pwaDesc']}>
                  {shakePermission === 'denied'
                    ? "Motion access was denied, so shaking your device won't open the report screen — that permission has to come from Safari, not from Patches."
                    : 'iOS requires a one-time tap before Patches can read motion, so shaking can open the report screen.'}
                </p>
                <button
                  type="button"
                  className={styles['pwaInstallBtn']}
                  onClick={() => void requestShakeToReportPermission()}
                >
                  {shakePermission === 'denied' ? 'Try again' : 'Enable shake to report'}
                </button>
                <p className={styles['pwaDesc']}>
                  Either way, you can always <Link to="/report">report an issue</Link> from the
                  menu.
                </p>
              </div>
            )}
          </div>
        </section>
      ) : null}
    </div>
  );
}
