import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useOthers, useStorage } from "@liveblocks/react/suspense";
import { Shape } from "../classes/shape";
import type { ReadonlyJsonObject } from "@liveblocks/client";
import { normalizeShape } from "../editor/geometry";
import {
  hydrateShapeAssets,
  replaceCollaborativeShapes,
  setCurrentUsers,
  updateBackgroundColor,
} from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";
import type { RootState } from "../store";
import { resolveAssetUrl } from "../services/assetRepository";

const CollaborationBridge = () => {
  const dispatch = useDispatch<AppDispatch>();
  const localPreviewActive = useSelector((state: RootState) => state.editor.localPreviewActive);
  const nodes = useStorage((root) => root.nodes);
  const backgroundColor = useStorage((root) => root.backgroundColor);
  const others = useOthers();
  const shapes = useMemo(
    () => Object.values(nodes as ReadonlyJsonObject)
      .map((shape) => normalizeShape(shape as unknown as Shape))
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id)),
    [nodes]
  );

  useEffect(() => {
    if (localPreviewActive) return;
    dispatch(replaceCollaborativeShapes(shapes));
    const assetShapes = shapes.filter((shape) => shape.assetId);
    if (!assetShapes.length) return;
    let active = true;
    void Promise.all(assetShapes.map(async (shape) => ({
      id: shape.id,
      assetId: shape.assetId!,
      url: await resolveAssetUrl(shape.assetId!),
    })))
      .then((hydrated) => {
        if (active) dispatch(hydrateShapeAssets(hydrated));
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, [dispatch, localPreviewActive, shapes]);

  useEffect(() => {
    dispatch(updateBackgroundColor(backgroundColor));
  }, [backgroundColor, dispatch]);

  useEffect(() => {
    dispatch(setCurrentUsers(others.map((other) => ({
      uid: other.id,
      label: other.info.name || other.info.email || "Collaborator",
      cursorX: other.presence.cursor?.x ?? null,
      cursorY: other.presence.cursor?.y ?? null,
      selectionIds: other.presence.selectionIds,
    }))));
  }, [dispatch, others]);

  return null;
};

export default CollaborationBridge;
