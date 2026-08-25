import { createClient } from "@supabase/supabase-js";
import { authenticatedFetch } from "./apiClient";

export interface WorkspaceFont {
  id: string;
  workspace_id: string;
  family: string;
  style: "normal" | "italic";
  weight_min: number;
  weight_max: number;
  storage_key: string;
  mime_type: string;
  created_at: string;
  url: string;
}

const storage = () => {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Supabase public upload configuration is incomplete.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
};

export const loadWorkspaceFonts = () => authenticatedFetch<{ fonts: WorkspaceFont[] }>("/api/platform?scope=workspace-fonts").then((result) => result.fonts);

export const uploadWorkspaceFont = async (file: File, family: string, input: { style?: "normal" | "italic"; weightMin?: number; weightMax?: number } = {}) => {
  const inferredType = file.type || ({ woff: "font/woff", woff2: "font/woff2", ttf: "font/ttf", otf: "font/otf" }[file.name.split(".").pop()?.toLowerCase() ?? ""] ?? "");
  const uploadFile = file.type === inferredType ? file : new File([file], file.name, { type: inferredType });
  const prepared = await authenticatedFetch<{ upload: { path: string; token: string; signedUrl: string } }>("/api/platform", { method: "POST", body: JSON.stringify({ action: "prepare-font-upload", fileName: uploadFile.name, mimeType: inferredType, byteSize: uploadFile.size }) });
  const { error } = await storage().storage.from("workspace-fonts").uploadToSignedUrl(prepared.upload.path, prepared.upload.token, uploadFile, { contentType: inferredType, upsert: false });
  if (error) throw error;
  return authenticatedFetch<{ font: WorkspaceFont }>("/api/platform", { method: "POST", body: JSON.stringify({ action: "complete-font-upload", storageKey: prepared.upload.path, family, style: input.style ?? "normal", weightMin: input.weightMin ?? 400, weightMax: input.weightMax ?? input.weightMin ?? 400 }) }).then((result) => result.font);
};
