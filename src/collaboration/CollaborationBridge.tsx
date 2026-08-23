import { useEffect, useMemo } from "react";
import { useDispatch } from "react-redux";
import { useOthers, useStorage } from "@liveblocks/react/suspense";
import { Shape } from "../classes/shape";
import type { JsonObject } from "@liveblocks/client";
import { normalizeShape } from "../editor/geometry";
import {
  replaceShapes,
  setCurrentUsers,
  updateBackgroundColor,
} from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";
import { resolveAssetUrl } from "../services/assetRepository";

const CollaborationBridge = () => {
  const dispatch = useDispatch<AppDispatch>();
  const nodes = useStorage((root) => root.nodes);
  const backgroundColor = useStorage((root) => root.backgroundColor);
  const others = useOthers();
  const shapes = useMemo(
    () => [...(nodes as unknown as ReadonlyMap<string, JsonObject>).values()]
      .map((shape) => normalizeShape(shape as unknown as Shape))
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)),
    [nodes]
  );

  useEffect(() => {
    dispatch(replaceShapes(shapes));
    const assetShapes = shapes.filter((shape) => shape.assetId);
    if (!assetShapes.length) return;
    let active = true;
    void Promise.all(shapes.map(async (shape) => shape.assetId
      ? { ...shape, backgroundImage: await resolveAssetUrl(shape.assetId) }
      : shape))
      .then((hydrated) => {
        if (active) dispatch(replaceShapes(hydrated));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [dispatch, shapes]);

  useEffect(() => {
    dispatch(updateBackgroundColor(backgroundColor));
  }, [backgroundColor, dispatch]);

  useEffect(() => {
    dispatch(setCurrentUsers(others.map((other) => ({
      uid: other.id,
      label: other.info.name || other.info.email || "Collaborator",
      cursorX: other.presence.cursor?.x ?? 0,
      cursorY: other.presence.cursor?.y ?? 0,
      selectionIds: other.presence.selectionIds,
    }))));
  }, [dispatch, others]);

  return null;
};

export default CollaborationBridge;
