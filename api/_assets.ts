import { randomUUID } from "node:crypto";
import { getBoardAccess } from "./_boards.js";
import { supabaseAdmin } from "./_supabase.js";

const bucket = "board-assets";

interface AssetRow {
  id: string;
  board_id: string;
  storage_key: string;
  mime_type: string;
  byte_size: number;
  width: number | null;
  height: number | null;
}

const walkObjects = (value: unknown, visit: (object: Record<string, unknown>) => void): void => {
  if (Array.isArray(value)) {
    value.forEach((item) => walkObjects(item, visit));
    return;
  }
  if (!value || typeof value !== "object") return;
  const object = value as Record<string, unknown>;
  visit(object);
  Object.values(object).forEach((item) => walkObjects(item, visit));
};

export const documentAssetIds = (document: unknown): string[] => {
  const ids = new Set<string>();
  walkObjects(document, (object) => {
    if (typeof object.assetId === "string") ids.add(object.assetId);
  });
  return [...ids];
};

export const rewriteDocumentAssetIds = (
  document: unknown,
  replacements: ReadonlyMap<string, string> | Record<string, string>
): unknown => {
  const mapping = replacements instanceof Map
    ? replacements
    : new Map(Object.entries(replacements));
  const cloned = JSON.parse(JSON.stringify(document)) as unknown;
  walkObjects(cloned, (object) => {
    const replacement = typeof object.assetId === "string"
      ? mapping.get(object.assetId)
      : undefined;
    if (!replacement) return;
    object.assetId = replacement;
    delete object.backgroundImage;
  });
  return cloned;
};

const copiedStorageKey = (boardId: string, sourceKey: string): string => {
  const fileName = sourceKey.slice(sourceKey.lastIndexOf("/") + 1);
  const extension = fileName.includes(".")
    ? fileName.slice(fileName.lastIndexOf(".")).replace(/[^.a-z0-9]/gi, "").slice(0, 9)
    : "";
  return `${boardId}/${randomUUID()}${extension}`;
};

export const cloneAssetsToBoard = async ({
  actorUid,
  targetBoardId,
  assetIds,
}: {
  actorUid: string;
  targetBoardId: string;
  assetIds: readonly string[];
}): Promise<Map<string, string>> => {
  const ids = [...new Set(assetIds)];
  if (!ids.length) return new Map();
  const database = supabaseAdmin();
  const { data, error } = await database
    .from("assets")
    .select("id, board_id, storage_key, mime_type, byte_size, width, height")
    .in("id", ids);
  if (error) throw error;
  const assets = (data ?? []) as AssetRow[];
  if (assets.length !== ids.length) throw new Error("One or more board images are unavailable.");

  const access = await Promise.all(
    assets.map((asset) => getBoardAccess(asset.board_id, actorUid))
  );
  if (access.some((item) => !item)) {
    throw new Error("One or more board images are unavailable.");
  }

  const copiedKeys: string[] = [];
  const copies: Array<AssetRow & { sourceId: string }> = [];
  try {
    for (const asset of assets) {
      const id = randomUUID();
      const storageKey = copiedStorageKey(targetBoardId, asset.storage_key);
      const { error: copyError } = await database.storage
        .from(bucket)
        .copy(asset.storage_key, storageKey);
      if (copyError) throw copyError;
      copiedKeys.push(storageKey);
      copies.push({ ...asset, sourceId: asset.id, id, board_id: targetBoardId, storage_key: storageKey });
    }
    const { error: insertError } = await database.from("assets").insert(
      copies.map((asset) => ({
        id: asset.id,
        board_id: asset.board_id,
        uploader_id: actorUid,
        storage_key: asset.storage_key,
        mime_type: asset.mime_type,
        byte_size: asset.byte_size,
        width: asset.width,
        height: asset.height,
      }))
    );
    if (insertError) throw insertError;
    return new Map(copies.map((asset) => [asset.sourceId, asset.id]));
  } catch (error) {
    if (copiedKeys.length) {
      await database.storage.from(bucket).remove(copiedKeys).catch(() => undefined);
    }
    throw error;
  }
};
