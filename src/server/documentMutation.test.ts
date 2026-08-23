import type { PlainLsonObject } from "@liveblocks/node";
import { replaceStorageDocument, withDocumentLease } from "../../api/_documentMutation";

const document = (name: string) => ({ liveblocksType: "LiveObject", data: { name } }) as unknown as PlainLsonObject;

describe("recoverable Liveblocks document replacement", () => {
  it("serializes mutations with a short database lease and always releases it", async () => {
    const rpc = vi.fn(async (name: string) => ({ data: name === "acquire_kumo_document_lease", error: null }));
    const operation = vi.fn().mockResolvedValue("done");
    await expect(withDocumentLease({ rpc }, "room", operation)).resolves.toBe("done");
    expect(rpc).toHaveBeenNthCalledWith(1, "acquire_kumo_document_lease", expect.objectContaining({ p_room_id: "room" }));
    expect(rpc).toHaveBeenLastCalledWith("release_kumo_document_lease", expect.objectContaining({ p_room_id: "room" }));
  });

  it("rejects a concurrent mutation without starting the operation", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: false, error: null });
    const operation = vi.fn();
    await expect(withDocumentLease({ rpc }, "room", operation)).rejects.toMatchObject({ name: "DocumentConflict" });
    expect(operation).not.toHaveBeenCalled();
  });

  it("commits a replacement without invoking rollback", async () => {
    const client = { deleteStorageDocument: vi.fn().mockResolvedValue(undefined), initializeStorageDocument: vi.fn().mockResolvedValue(undefined) };
    const commit = vi.fn().mockResolvedValue(undefined);
    const rollback = vi.fn().mockResolvedValue(undefined);
    await replaceStorageDocument({ client, roomId: "room", current: document("old"), next: document("new"), commit, rollback });
    expect(client.initializeStorageDocument).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it("restores the old document and derived state after a commit failure", async () => {
    const client = { deleteStorageDocument: vi.fn().mockResolvedValue(undefined), initializeStorageDocument: vi.fn().mockResolvedValue(undefined) };
    const rollback = vi.fn().mockResolvedValue(undefined);
    await expect(replaceStorageDocument({
      client,
      roomId: "room",
      current: document("old"),
      next: document("new"),
      commit: vi.fn().mockRejectedValue(new Error("commit failed")),
      rollback,
    })).rejects.toThrow("commit failed");
    expect(client.deleteStorageDocument).toHaveBeenCalledTimes(2);
    expect(client.initializeStorageDocument).toHaveBeenNthCalledWith(2, "room", document("old"));
    expect(rollback).toHaveBeenCalled();
  });

  it("attempts recovery and releases derived state when the initial delete fails", async () => {
    const client = {
      deleteStorageDocument: vi.fn().mockRejectedValueOnce(new Error("delete failed")).mockResolvedValue(undefined),
      initializeStorageDocument: vi.fn().mockResolvedValue(undefined),
    };
    const rollback = vi.fn().mockResolvedValue(undefined);
    await expect(replaceStorageDocument({
      client,
      roomId: "room",
      current: document("old"),
      next: document("new"),
      commit: vi.fn(),
      rollback,
    })).rejects.toThrow("delete failed");
    expect(client.deleteStorageDocument).toHaveBeenCalledTimes(2);
    expect(client.initializeStorageDocument).toHaveBeenCalledWith("room", document("old"));
    expect(rollback).toHaveBeenCalled();
  });

  it("surfaces an explicit recovery failure if the old document cannot be restored", async () => {
    const client = {
      deleteStorageDocument: vi.fn().mockResolvedValue(undefined),
      initializeStorageDocument: vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("restore failed")),
    };
    await expect(replaceStorageDocument({
      client,
      roomId: "room",
      current: document("old"),
      next: document("new"),
      commit: vi.fn().mockRejectedValue(new Error("commit failed")),
    })).rejects.toMatchObject({ name: "DocumentRecoveryFailed" });
  });
});
