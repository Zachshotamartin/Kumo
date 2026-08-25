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
  setWhiteboardData,
  updateBackgroundColor,
} from "../features/whiteBoard/whiteBoardSlice";
import { AppDispatch } from "../store";
import type { RootState } from "../store";
import { setFollowingUserId, setViewport } from "../features/editor/editorSlice";
import { useEventListener, useMutation } from "@liveblocks/react";
import { resolveAssetUrl } from "../services/assetRepository";
import { collaborativeTextValue, type CollaborativeTextCharacter } from "./textCrdt";

const CollaborationBridge = () => {
  const dispatch = useDispatch<AppDispatch>();
  const localPreviewActive = useSelector((state: RootState) => state.editor.localPreviewActive);
  const nodes = useStorage((root) => root.nodes);
  const storedTextCharacters = useStorage((root) => root.textCharacters);
  const textCharacters = useMemo(() => storedTextCharacters ?? {}, [storedTextCharacters]);
  const backgroundColor = useStorage((root) => root.backgroundColor);
  const others = useOthers();
  const followingUserId = useSelector((state: RootState) => state.editor.followingUserId);
  useEventListener(({ event }) => {
    if (event.type === "SPOTLIGHT_START") dispatch(setFollowingUserId(event.presenterId));
    if (event.type === "SPOTLIGHT_STOP") dispatch(setFollowingUserId(null));
    if (event.type === "DOCUMENT_RESTORED") {
      dispatch(setFollowingUserId(null));
      dispatch(setWhiteboardData({ revision: event.revision }));
    }
  });
  const shapes = useMemo(() => {
    const characters = Object.values(textCharacters as ReadonlyJsonObject) as unknown as CollaborativeTextCharacter[];
    return Object.values(nodes as ReadonlyJsonObject)
      .map((shape) => {
        const normalized = normalizeShape(shape as unknown as Shape);
        const collaborativeText = collaborativeTextValue(characters, normalized.id);
        return collaborativeText || characters.some((character) => character.shapeId === normalized.id)
          ? { ...normalized, text: collaborativeText }
          : normalized;
      })
      .sort((left, right) => left.zIndex - right.zIndex || left.id.localeCompare(right.id));
  }, [nodes, textCharacters]);
  const reconcileText = useMutation(({ storage }, values: Array<{ id: string; text: string }>) => {
    values.forEach(({ id, text }) => {
      const node = storage.get("nodes").get(id);
      if (node && node.get("text") !== text) node.update({ text });
    });
  }, []);

  useEffect(() => {
    const collaborative = shapes.filter((shape) => shape.type === "text" && Object.values(textCharacters as ReadonlyJsonObject).some((character) => (character as unknown as CollaborativeTextCharacter).shapeId === shape.id));
    if (collaborative.length) reconcileText(collaborative.map((shape) => ({ id: shape.id, text: shape.text ?? "" })));
  }, [reconcileText, shapes, textCharacters]);

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
      viewport: other.presence.viewport,
      spotlight: other.presence.spotlight,
      activeShapeIds: other.presence.activeShapeIds,
      activity: other.presence.activity,
      cursorChat: other.presence.cursorChat,
      textSelection: other.presence.textSelection,
    }))));
  }, [dispatch, others]);

  useEffect(() => {
    if (!followingUserId) return;
    const followed = others.find((other) => other.id === followingUserId);
    if (!followed) {
      dispatch(setFollowingUserId(null));
      return;
    }
    dispatch(setViewport(followed.presence.viewport));
  }, [dispatch, followingUserId, others]);

  return null;
};

export default CollaborationBridge;
