/**
 * The media types Kumo accepts for board uploads.
 *
 * The `accept` attribute on a file input is only a hint to the picker, so the upload path re-checks
 * the chosen file against this allowlist. `acceptedMediaType` deliberately returns one of the
 * literals below rather than the file's own `type` string, which keeps browser-reported metadata
 * out of the object URLs and media elements that probe an upload for its dimensions.
 */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"] as const;
export const ACCEPTED_VIDEO_TYPES = ["video/mp4", "video/webm"] as const;

export type AcceptedVideoType = (typeof ACCEPTED_VIDEO_TYPES)[number];
export type AcceptedMediaType = (typeof ACCEPTED_IMAGE_TYPES)[number] | AcceptedVideoType;

export const ACCEPTED_MEDIA_TYPES: readonly AcceptedMediaType[] = [
  ...ACCEPTED_IMAGE_TYPES,
  ...ACCEPTED_VIDEO_TYPES,
];

export const acceptedMediaType = (file: File): AcceptedMediaType | null =>
  ACCEPTED_MEDIA_TYPES.find((candidate) => candidate === file.type) ?? null;

export const isAcceptedVideoType = (type: AcceptedMediaType): type is AcceptedVideoType =>
  ACCEPTED_VIDEO_TYPES.some((candidate) => candidate === type);

export const unsupportedMediaMessage =
  "Kumo accepts PNG, JPEG, WebP, GIF and SVG images, and MP4 or WebM video.";
