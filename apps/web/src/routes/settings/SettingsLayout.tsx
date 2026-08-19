import type { JSX } from 'react';
import { NavLink, Outlet } from 'react-router-dom';

import styles from './SettingsLayout.module.css';

const LINK_CLASS = ({ isActive }: { isActive: boolean }): string =>
  isActive ? `${styles['navLink']} ${styles['active']}` : (styles['navLink'] ?? '');

/**
 * `/settings/*` shell — profile cosmetics plus the Amendment C safety surface
 * (privacy, filters, filter lists, labelers; spec §196–§210, P14-018). Every safety
 * action the TUI exposes must be reachable from here (§205).
 */
export function SettingsLayout(): JSX.Element {
  return (
    <div className={styles['wrap']}>
      <nav className={styles['nav']} aria-label="Settings">
        <NavLink to="/settings/profile" className={LINK_CLASS} end>
          Profile
        </NavLink>
        <NavLink to="/settings/privacy" className={LINK_CLASS}>
          Privacy
        </NavLink>
        <NavLink to="/settings/filters" className={LINK_CLASS}>
          Filters
        </NavLink>
        <NavLink to="/settings/lists" className={LINK_CLASS}>
          Filter lists
        </NavLink>
        <NavLink to="/settings/labelers" className={LINK_CLASS}>
          Labelers
        </NavLink>
      </nav>
      <div className={styles['content']}>
        <Outlet />
      </div>
    </div>
  );
}
