/**
 * P19-016: this app has no dedicated DM/messages screen and no push registration, so the
 * `NotificationType.MESSAGE` row rendered by `NotificationsScreen` is the only signal this
 * client ever gives that a message arrived — and only when that list is opened or pulled
 * to refresh, never in the background. No wording here may imply otherwise (push, live,
 * instant, or realtime delivery). Kept in its own module (rather than inline in the
 * screen) so this string can be unit-tested without importing `react-native`.
 */
export const DM_ARRIVAL_NOTE =
  'New messages only show up here when you open or pull to refresh this screen — this app has no push or background signal for them.';
