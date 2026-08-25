import { LiveMap, LiveObject, type LsonObject } from "@liveblocks/client";
import { useMutation } from "@liveblocks/react";
import { useCallback } from "react";
import { applyCollaborativeTextChange, type CollaborativeTextCharacter } from "./textCrdt";

const storedCharacter = (value: CollaborativeTextCharacter) => new LiveObject(value as unknown as LsonObject);

export const useCollaborativeText = () => {
  const mutate = useMutation(({ storage }, shapeId: string, previousText: string, nextText: string) => {
    let characters = storage.get("textCharacters");
    if (!characters) {
      characters = new LiveMap<string, LiveObject<LsonObject>>();
      storage.set("textCharacters", characters);
    }
    const records: CollaborativeTextCharacter[] = [];
    characters.forEach((value) => records.push({
      id: String(value.get("id")),
      shapeId: String(value.get("shapeId")),
      leftId: value.get("leftId") == null ? null : String(value.get("leftId")),
      position: Number(value.get("position")),
      value: String(value.get("value")),
      deleted: Boolean(value.get("deleted")),
    }));
    const result = applyCollaborativeTextChange(records, shapeId, previousText, nextText, () => crypto.randomUUID());
    const before = new Map(records.map((record) => [record.id, record]));
    result.records.forEach((record) => {
      const current = characters.get(record.id);
      if (!current) characters.set(record.id, storedCharacter(record));
      else if (before.get(record.id)?.deleted !== record.deleted || before.get(record.id)?.position !== record.position) current.update({ deleted: record.deleted, position: record.position });
    });
    storage.get("nodes").get(shapeId)?.update({ text: result.text });
  }, []);

  return useCallback((shapeId: string, previousText: string, nextText: string) => mutate(shapeId, previousText, nextText), [mutate]);
};
