import { MAX_KUMO_IMPORT_BYTES, readKumoDocumentFile } from "./import";

describe("Kumo document file input", () => {
  it("reads files within the byte limit", async () => {
    const file = new File(["document"], "board.kumo.json", { type: "application/json" });
    await expect(readKumoDocumentFile(file)).resolves.toBe("document");
  });

  it("rejects files above the byte limit before reading", async () => {
    const text = vi.fn().mockResolvedValue("document");
    const file = { size: MAX_KUMO_IMPORT_BYTES + 1, text } as unknown as File;
    expect(() => readKumoDocumentFile(file)).toThrow("10 MB import limit");
    expect(text).not.toHaveBeenCalled();
  });
});
