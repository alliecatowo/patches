import { toast } from 'sonner';

export interface ToastAction {
  readonly label: string;
  readonly onClick: () => void;
}

/**
 * A toast with a single undo/retry-style action button (#325), on top of the plain `toast()`
 * calls already scattered across the app (`useErrorToast`, `PostCard`, …). The button's look
 * comes from `Toaster`'s `actionButtonStyle` in `main.tsx`, not from a class here — sonner
 * renders its own portal outside this module tree, so there is no CSS module to hand it.
 */
export function showActionToast(message: string, action: ToastAction): void {
  toast(message, {
    action: {
      label: action.label,
      onClick: action.onClick,
    },
  });
}
