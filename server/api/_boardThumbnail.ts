import { Buffer } from "node:buffer";
import type { Shape } from "../../src/classes/shape.js";
import { serializeSvg } from "../../src/editor/export.js";
import { normalizeShape, selectionBounds } from "../../src/editor/geometry.js";
import type { Bounds } from "../../src/editor/types.js";
import { supabaseAdmin } from "./_supabase.js";

const THUMBNAIL_ASPECT_RATIO = 1.55;
const THUMBNAIL_MINIMUM_PADDING = 48;
const THUMBNAIL_REFRESH_WINDOW_MS = 15_000;
const SIGNED_URL_LIFETIME_SECONDS = 60 * 60;

type ThumbnailBoard = {
  id: string;
  owner_id: string;
  thumbnail_asset_id: string | null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? value as Record<string, unknown> : {};

const sanitizeShape = (shape: Shape): Shape => ({
  ...shape,
  backgroundImage: shape.backgroundImage?.startsWith("data:image/")
    ? shape.backgroundImage
    : undefined,
  shapes: shape.shapes?.slice(0, 500).map(sanitizeShape),
  booleanChildren: shape.booleanChildren?.slice(0, 500).map(sanitizeShape),
});

export const thumbnailDocument = (document: unknown): {
  backgroundColor: string;
  shapes: Shape[];
} => {
  const source = asRecord(document);
  const nodes = asRecord(source.nodes);
  const shapes = Object.entries(nodes).slice(0, 2_000).flatMap(([id, value], index) => {
    const candidate = asRecord(value);
    if (typeof candidate.type !== "string") return [];
    const x1 = typeof candidate.x1 === "number" && Number.isFinite(candidate.x1) ? candidate.x1 : 0;
    const y1 = typeof candidate.y1 === "number" && Number.isFinite(candidate.y1) ? candidate.y1 : 0;
    const width = typeof candidate.width === "number" && Number.isFinite(candidate.width)
      ? Math.max(0, candidate.width)
      : 1;
    const height = typeof candidate.height === "number" && Number.isFinite(candidate.height)
      ? Math.max(0, candidate.height)
      : 1;
    return [sanitizeShape(normalizeShape({
      ...candidate,
      id,
      type: candidate.type,
      x1,
      y1,
      x2: typeof candidate.x2 === "number" && Number.isFinite(candidate.x2) ? candidate.x2 : x1 + width,
      y2: typeof candidate.y2 === "number" && Number.isFinite(candidate.y2) ? candidate.y2 : y1 + height,
      width,
      height,
      level: typeof candidate.level === "number" ? candidate.level : 0,
      zIndex: typeof candidate.zIndex === "number" ? candidate.zIndex : index + 1,
    } as Shape))];
  });
  return {
    backgroundColor: typeof source.backgroundColor === "string"
      ? source.backgroundColor.slice(0, 64)
      : "#252629",
    shapes,
  };
};

export const thumbnailBounds = (shapes: Shape[]): Bounds => {
  const visible = shapes.filter((shape) => !shape.hidden && shape.type !== "guide" && shape.type !== "resource");
  const content = selectionBounds(visible, visible.map((shape) => shape.id));
  if (!content) return { x: 0, y: 0, width: 1200, height: 1200 / THUMBNAIL_ASPECT_RATIO };
  const padding = Math.max(
    THUMBNAIL_MINIMUM_PADDING,
    Math.max(content.width, content.height) * 0.12
  );
  let width = Math.max(1, content.width + padding * 2);
  let height = Math.max(1, content.height + padding * 2);
  if (width / height < THUMBNAIL_ASPECT_RATIO) width = height * THUMBNAIL_ASPECT_RATIO;
  else height = width / THUMBNAIL_ASPECT_RATIO;
  return {
    x: content.x + content.width / 2 - width / 2,
    y: content.y + content.height / 2 - height / 2,
    width,
    height,
  };
};

export const serializeBoardThumbnail = (document: unknown): string => {
  const parsed = thumbnailDocument(document);
  return serializeSvg(
    parsed.shapes,
    [],
    parsed.backgroundColor,
    thumbnailBounds(parsed.shapes)
  ).replace("<svg ", '<svg role="img" aria-label="Board preview" preserveAspectRatio="xMidYMid meet" ');
};

export const updateBoardThumbnail = async (
  board: ThumbnailBoard,
  document: unknown
): Promise<string | null> => {
  const database = supabaseAdmin();
  const storageKey = `${board.id}/thumbnail.svg`;
  const { data: existing, error: existingError } = await database
    .from("assets")
    .select("id, created_at")
    .eq("storage_key", storageKey)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing && Date.now() - new Date(existing.created_at).getTime() < THUMBNAIL_REFRESH_WINDOW_MS) {
    return existing.id as string;
  }

  const svg = serializeBoardThumbnail(document);
  const bytes = Buffer.from(svg, "utf8");
  const { error: uploadError } = await database.storage.from("board-assets").upload(
    storageKey,
    bytes,
    { contentType: "image/svg+xml", cacheControl: "3600", upsert: true }
  );
  if (uploadError) throw uploadError;

  const now = new Date().toISOString();
  const { data: asset, error: assetError } = await database.from("assets").upsert({
    board_id: board.id,
    uploader_id: board.owner_id,
    storage_key: storageKey,
    mime_type: "image/svg+xml",
    byte_size: bytes.byteLength,
    width: 1200,
    height: Math.round(1200 / THUMBNAIL_ASPECT_RATIO),
    created_at: now,
  }, { onConflict: "storage_key" }).select("id").single();
  if (assetError) throw assetError;
  const assetId = asset.id as string;
  const { error: boardError } = await database
    .from("boards")
    .update({ thumbnail_asset_id: assetId })
    .eq("id", board.id);
  if (boardError) throw boardError;
  return assetId;
};

export const boardThumbnailUrls = async (
  boards: readonly Pick<ThumbnailBoard, "thumbnail_asset_id">[]
): Promise<Map<string, string>> => {
  const ids = [...new Set(boards.flatMap((board) => board.thumbnail_asset_id ? [board.thumbnail_asset_id] : []))];
  if (!ids.length) return new Map();
  const database = supabaseAdmin();
  const { data: assets, error } = await database
    .from("assets")
    .select("id, storage_key")
    .in("id", ids);
  if (error) throw error;
  const storageKeys = (assets ?? []).map((asset) => asset.storage_key as string);
  const { data: signed, error: signedError } = await database.storage
    .from("board-assets")
    .createSignedUrls(storageKeys, SIGNED_URL_LIFETIME_SECONDS);
  if (signedError) throw signedError;
  const urlByPath = new Map((signed ?? []).flatMap((entry) =>
    entry.signedUrl ? [[entry.path, entry.signedUrl] as const] : []
  ));
  return new Map((assets ?? []).flatMap((asset) => {
    const url = urlByPath.get(asset.storage_key as string);
    return url ? [[asset.id as string, url] as const] : [];
  }));
};
