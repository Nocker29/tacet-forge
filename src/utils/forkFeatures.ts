/**
 * Tacet Forge feature switches. Plain constants (not settings) so a disabled
 * feature is fully unreachable in the shipped app; flip to re-enable.
 *
 * SCANNER_ENABLED gates the screen-share/video echo scanner (Labs → Echo scanning),
 * the Wavescan settings section, and the scanner-data.json / scanner-assets.json
 * files the build publishes for Wavescan (vite.config.ts). The code stays in place.
 */
export const SCANNER_ENABLED = false;
