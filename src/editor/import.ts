export const MAX_KUMO_IMPORT_BYTES = 10 * 1024 * 1024;

export const readKumoDocumentFile = (file: File) => {
  if (file.size > MAX_KUMO_IMPORT_BYTES) {
    throw new Error("This Kumo document is larger than the 10 MB import limit.");
  }
  return file.text();
};
