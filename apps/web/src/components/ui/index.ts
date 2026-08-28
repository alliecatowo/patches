/**
 * The web client's shared UI primitives (#325, #336). Every one consumes only the design
 * tokens in `src/styles/tokens.css`; none of them fetch, route, or know about a domain type.
 */
export { Avatar, AvatarCluster, hueFor, initialsFor } from './Avatar.js';
export type { AvatarClusterProps, AvatarProps, AvatarSize } from './Avatar.js';
export { Button, ButtonGroup } from './Button.js';
export type { ButtonGroupProps, ButtonProps, ButtonSize, ButtonVariant } from './Button.js';
export { EmptyState } from './EmptyState.js';
export type { EmptyStateProps } from './EmptyState.js';
export {
  ConversationsIllustration,
  DeviceKeyIllustration,
  SelectConversationIllustration,
} from './Illustration.js';
export type { IllustrationProps } from './Illustration.js';
export { ListRow, UnreadDot } from './ListRow.js';
export type { ListRowProps } from './ListRow.js';
export { Panel } from './Panel.js';
export type { PanelProps } from './Panel.js';
export { StatusChip } from './StatusChip.js';
export type { StatusChipProps, StatusTone } from './StatusChip.js';
