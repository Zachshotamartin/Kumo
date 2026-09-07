import { useCanRedo, useCanUndo, useHistory, useMutation } from "@liveblocks/react";
import type { Shape } from "../classes/shape";
import { applyShapeMutation } from "../collaboration/mutations";
import { updateBoardSettings } from "../services/boardRepository";
import { cloneBoardAssets } from "../services/assetRepository";
import { useEditorActionsCore } from "./useEditorActionsCore";

/** Liveblocks persistence for the shared editor command layer. */
export const useEditorActions = () => {
  const history = useHistory();
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const mutateShapes = useMutation(
    ({ storage }, nextShapes: Shape[], previousShapes: Shape[]) => {
      applyShapeMutation(storage.get("nodes"), nextShapes, previousShapes);
    }, []
  );
  const mutateBackground = useMutation(({ storage }, color: string) => {
    storage.set("backgroundColor", color);
  }, []);
  return useEditorActionsCore({
    mutateShapes, mutateBackground, updateBoardSettings, cloneBoardAssets, history, canUndo, canRedo,
  });
};
export type { EditorActions } from "./useEditorActionsCore";
