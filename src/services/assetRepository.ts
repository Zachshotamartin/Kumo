import { createClient } from "@supabase/supabase-js";
import { authenticatedFetch } from "./apiClient";

export interface BoardAsset {
  id: string;
  board_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  url: string;
}

const storageClient = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public upload configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const uploadBoardAsset = async (
  boardId: string,
  file: File,
  dimensions: { width: number; height: number }
): Promise<BoardAsset> => {
  const prepared = await authenticatedFetch<{
    upload: { path: string; token: string; signedUrl: string };
  }>("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      action: "prepare",
      boardId,
      fileName: file.name,
      mimeType: file.type,
      byteSize: file.size,
    }),
  });
  const { error } = await storageClient().storage
    .from("board-assets")
    .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
      contentType: file.type,
      upsert: false,
    });
  if (error) throw error;
  const completed = await authenticatedFetch<{ asset: BoardAsset }>("/api/assets", {
    method: "POST",
    body: JSON.stringify({
      action: "complete",
      boardId,
      storageKey: prepared.upload.path,
      width: dimensions.width,
      height: dimensions.height,
    }),
  });
  return completed.asset;
};

export const uploadBoardImage = uploadBoardAsset;

const signedUrlCache = new Map<string, { url: string; expiresAt: number }>();

export const resolveAssetUrl = async (assetId: string): Promise<string> => {
  const cached = signedUrlCache.get(assetId);
  if (cached && cached.expiresAt > Date.now()) return cached.url;
  const result = await authenticatedFetch<{ asset: BoardAsset }>(
    `/api/assets?id=${encodeURIComponent(assetId)}`
  );
  signedUrlCache.set(assetId, { url: result.asset.url, expiresAt: Date.now() + 50 * 60_000 });
  return result.asset.url;
};

export const rewriteShapeAssetIds = (
  shapes: import("../classes/shape").Shape[],
  assetIds: Record<string, string>
): import("../classes/shape").Shape[] => shapes.map((shape) => ({
  ...shape,
  ...(shape.assetId && assetIds[shape.assetId]
    ? { assetId: assetIds[shape.assetId], backgroundImage: undefined }
    : {}),
  ...(shape.shapes
    ? { shapes: rewriteShapeAssetIds(shape.shapes, assetIds) }
    : {}),
}));

export const collectShapeAssetIds = (
  shapes: import("../classes/shape").Shape[]
): string[] => [...new Set(shapes.flatMap((shape): string[] => [
  ...(shape.assetId ? [shape.assetId] : []),
  ...(shape.shapes ? collectShapeAssetIds(shape.shapes) : []),
]))];

export const cloneBoardAssets = async (
  boardId: string,
  assetIds: string[]
): Promise<Record<string, string>> => {
  if (!assetIds.length) return {};
  const result = await authenticatedFetch<{ assetIds: Record<string, string> }>("/api/assets", {
    method: "POST",
    body: JSON.stringify({ action: "clone", boardId, assetIds: [...new Set(assetIds)] }),
  });
  return result.assetIds;
};

export const deleteBoardAsset = async (assetId: string): Promise<void> => {
  await authenticatedFetch<void>(`/api/assets?id=${encodeURIComponent(assetId)}`, {
    method: "DELETE",
  });
  signedUrlCache.delete(assetId);
};
