import type { ButtonHTMLAttributes, JSX, ReactNode } from 'react';

import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly fullWidth?: boolean;
  /** Shows a spinner and disables the control; the label stays so the width never jumps. */
  readonly loading?: boolean;
  readonly icon?: ReactNode;
  /** Square control with no label — `aria-label` is then mandatory for the caller. */
  readonly iconOnly?: boolean;
  readonly children?: ReactNode;
}

/**
 * The one button in `apps/web` (#336). Variants map to intent, not colour: `primary` is the
 * single most-likely action on a surface, `secondary` an equal-weight alternative, `ghost` a
 * dismissal, `danger` a destructive confirm.
 *
 * `type` defaults to `button` — an unspecified `<button>` inside a form submits it, which is
 * never what a bare action wants.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  fullWidth = false,
  loading = false,
  icon,
  iconOnly = false,
  children,
  disabled,
  type = 'button',
  ...rest
}: ButtonProps): JSX.Element {
  const classNames = [
    styles['button'],
    styles[variant],
    styles[size],
    fullWidth ? styles['fullWidth'] : '',
    iconOnly ? styles['iconOnly'] : '',
  ]
    .filter((name) => name !== '' && name !== undefined)
    .join(' ');

  return (
    <button {...rest} type={type} className={classNames} disabled={disabled === true || loading}>
      {loading ? (
        <span className={styles['spinner']} aria-hidden="true" />
      ) : icon !== undefined ? (
        <span className={styles['icon']} aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {iconOnly ? null : children}
    </button>
  );
}

export interface ButtonGroupProps {
  /** `stacked` gives every action its own full-width row — used where the choices are
   * consequential enough that scanning them vertically matters more than compactness. */
  readonly direction?: 'row' | 'stacked';
  readonly children: ReactNode;
  readonly label?: string;
}

/** A related set of actions with consistent spacing. */
export function ButtonGroup({ direction = 'row', children, label }: ButtonGroupProps): JSX.Element {
  return (
    <div
      className={`${styles['group']} ${direction === 'stacked' ? styles['groupStacked'] : ''}`}
      role="group"
      aria-label={label}
    >
      {children}
    </div>
  );
}
