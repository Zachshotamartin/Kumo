import { randomUUID } from "node:crypto";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { requireActor } from "./_auth";
import { getBoardAccess } from "./_boards";
import { allowMethods, errorMessage, stringQuery } from "./_http";
import { ensureActorProfile, supabaseAdmin } from "./_supabase";

const bucket = "board-assets";
const allowedTypes = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "image/svg+xml"]);

const assetUrl = async (storageKey: string) => {
  const { data, error } = await supabaseAdmin().storage.from(bucket).createSignedUrl(storageKey, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
};

export default async function handler(request: VercelRequest, response: VercelResponse) {
  if (!allowMethods(request, response, ["GET", "POST"])) return;
  try {
    const actor = await requireActor(request);
    await ensureActorProfile(actor);
    const database = supabaseAdmin();

    if (request.method === "GET") {
      const assetId = stringQuery(request.query.id);
      const { data: asset, error } = await database
        .from("assets")
        .select("id, board_id, storage_key, mime_type, byte_size, width, height")
        .eq("id", assetId)
        .maybeSingle();
      if (error) throw error;
      if (!asset || !await getBoardAccess(asset.board_id, actor.uid)) {
        return response.status(404).json({ error: "Asset not found." });
      }
      return response.status(200).json({ asset: { ...asset, url: await assetUrl(asset.storage_key) } });
    }

    const boardId = typeof request.body?.boardId === "string" ? request.body.boardId : "";
    const access = await getBoardAccess(boardId, actor.uid);
    if (!access) return response.status(404).json({ error: "Board not found." });
    if (access.role === "viewer") return response.status(403).json({ error: "This board is view-only." });

    if (request.body?.action === "prepare") {
      const mimeType = typeof request.body?.mimeType === "string" ? request.body.mimeType : "";
      const byteSize = Number(request.body?.byteSize);
      if (!allowedTypes.has(mimeType) || !Number.isFinite(byteSize) || byteSize <= 0 || byteSize > 20 * 1024 * 1024) {
        return response.status(400).json({ error: "Upload a supported image no larger than 20 MB." });
      }
      const originalName = typeof request.body?.fileName === "string" ? request.body.fileName : "image";
      const extension = originalName.split(".").pop()?.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase();
      const storageKey = `${boardId}/${randomUUID()}${extension ? `.${extension}` : ""}`;
      const { data, error } = await database.storage.from(bucket).createSignedUploadUrl(storageKey);
      if (error) throw error;
      return response.status(200).json({ upload: data });
    }

    if (request.body?.action !== "complete") {
      return response.status(400).json({ error: "A valid asset action is required." });
    }
    const storageKey = typeof request.body?.storageKey === "string" ? request.body.storageKey : "";
    if (!storageKey.startsWith(`${boardId}/`) || storageKey.includes("..")) {
      return response.status(400).json({ error: "Invalid asset path." });
    }
    const slash = storageKey.lastIndexOf("/");
    const folder = storageKey.slice(0, slash);
    const fileName = storageKey.slice(slash + 1);
    const { data: objects, error: listError } = await database.storage
      .from(bucket)
      .list(folder, { search: fileName, limit: 2 });
    if (listError) throw listError;
    const object = objects.find((item) => item.name === fileName);
    if (!object) return response.status(409).json({ error: "Upload has not completed." });
    const mimeType = typeof object.metadata?.mimetype === "string" ? object.metadata.mimetype : "application/octet-stream";
    const byteSize = Number(object.metadata?.size ?? 0);
    if (!allowedTypes.has(mimeType) || byteSize > 20 * 1024 * 1024) {
      await database.storage.from(bucket).remove([storageKey]);
      return response.status(400).json({ error: "The uploaded object is not a supported image." });
    }
    const { data: asset, error: insertError } = await database.from("assets").insert({
      board_id: boardId,
      uploader_id: actor.uid,
      storage_key: storageKey,
      mime_type: mimeType,
      byte_size: byteSize,
      width: Number.isFinite(Number(request.body?.width)) ? Number(request.body.width) : null,
      height: Number.isFinite(Number(request.body?.height)) ? Number(request.body.height) : null,
    }).select("id, board_id, storage_key, mime_type, byte_size, width, height").single();
    if (insertError) throw insertError;
    return response.status(201).json({ asset: { ...asset, url: await assetUrl(storageKey) } });
  } catch (error) {
    const message = errorMessage(error, "The asset request failed.");
    return response.status(message === "Authentication required." ? 401 : 500).json({ error: message });
  }
}
