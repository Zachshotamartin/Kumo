import type { uploadBoardAsset } from "../services/assetRepository";

/** Browser-owned demo media. Nothing is uploaded before sign-in. */
export const createLocalAssets = () => {
  const urls = new Map<string, string>();
  const upload: typeof uploadBoardAsset = async (boardId, file, dimensions) => {
    const id = crypto.randomUUID();
    const url = URL.createObjectURL(file);
    urls.set(id, url);
    return {
      id, board_id: boardId, storage_key: id, mime_type: file.type, byte_size: file.size,
      width: dimensions.width, height: dimensions.height, url,
    };
  };
  const remove = async (id: string) => {
    const url = urls.get(id);
    if (url) URL.revokeObjectURL(url);
    urls.delete(id);
  };
  const dispose = () => {
    urls.forEach((url) => URL.revokeObjectURL(url));
    urls.clear();
  };
  return { upload, remove, dispose };
};
