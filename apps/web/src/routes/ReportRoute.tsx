import type { ReactElement } from 'react';
import styles from './ReportRoute.module.css';
import { IssueReporter } from '../components/IssueReporter.js';

/**
 * Dedicated `/report` route (B-112 follow-up): the fan-out menu's report entry and
 * shake-to-report land here, so the modal opens immediately over a minimal page — no
 * persistent corner chip anywhere in the shell.
 */
export function ReportRoute(): ReactElement {
  return (
    <main className={styles['page']}>
      <h1>Report an issue</h1>
      <p className={styles['lede']}>
        Bug, janky flow, or a feature you wish existed — anything counts. Diagnostics are attached
        automatically; nothing you type is required.
      </p>
      <IssueReporter variant="inline" autoOpen />
    </main>
  );
}
