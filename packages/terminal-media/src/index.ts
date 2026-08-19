export {
  APC_END,
  APC_START,
  MAX_24BIT_IMAGE_ID,
  MAX_CHUNK_BASE64,
  MAX_IMAGE_ID,
  PLACEHOLDER,
  buildGraphicsCommand,
  buildGraphicsCommandBase64,
  buildPlaceholderGrid,
  chunkTransmit,
  deleteAll,
  deleteImage,
  deleteRange,
  nextImageId,
  wrapTmuxPassthrough,
  type ChunkTransmitOptions,
  type GraphicsControl,
} from './protocol/kitty.js';

export { MAX_PLACEHOLDER_INDEX, ROW_COLUMN_DIACRITICS, diacritic } from './protocol/diacritics.js';

export {
  CELL_SIZE_QUERY,
  DA1_QUERY,
  GRAPHICS_QUERY,
  detectTerminalGraphics,
  looksGraphicsCapable,
  parseProbeResponse,
  terminalHint,
  tmuxAllowsPassthrough,
  type DetectOptions,
  type GraphicsCapabilities,
  type ProbeParseResult,
  type ProbeStdin,
  type ProbeStdout,
} from './detect.js';

export {
  DEFAULT_CELL_HEIGHT_PX,
  DEFAULT_CELL_WIDTH_PX,
  FallbackMediaRenderer,
  KittyGraphicsRenderer,
  MAX_INPUT_BYTES,
  MediaTooLargeError,
  buildFallbackBox,
  createRenderer,
  type CreateRendererOptions,
  type ImageRenderMode,
  type MediaSource,
  type MediaStdout,
  type PrepareOptions,
  type PreparedImage,
  type TerminalMediaRenderer,
} from './renderer.js';

export { AsciiRenderer, LUMINANCE_RAMP } from './art/ascii-renderer.js';

export { HalfBlockRenderer } from './art/halfblock-renderer.js';

export { detectColorSupport, rgbToAnsi256, type ColorSupport } from './art/color.js';

export { MAX_ART_COLS, MAX_ART_ROWS } from './art/shared.js';

export { renderArtPreview, type RenderArtPreviewOptions } from './art/preview.js';

export { installMediaCleanup, type MediaCleanupOptions } from './cleanup.js';

export {
  InlineImage,
  MediaRendererProvider,
  useMediaRenderer,
  useOptionalMediaRenderer,
  type InlineImageProps,
  type MediaRendererProviderProps,
} from './react/index.js';
