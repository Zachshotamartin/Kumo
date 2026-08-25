// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";

export interface WhiteBoardState {
  shapes: Shape[];
  id: string | null;
  roomId: string | null;
  baseRoomId: string | null;
  activeBranchId: string | null;
  activeBranchName: string | null;
  role: "owner" | "editor" | "viewer" | null;
  type: string | null;
  title: string | null;
  uid: string | null;
  sharedWith: string[];
  members: Record<string, "owner" | "editor" | "viewer">;
  linkedBoards: Record<string, {
    id: string;
    title: string;
    visibility: "private" | "public";
    accessible: boolean;
    role: "owner" | "editor" | "viewer" | null;
  }>;
  backGroundColor: string;
  lastChangedBy: string | null;
  currentUsers: {
    uid: string;
    label?: string;
    cursorX: number | null;
    cursorY: number | null;
    selectionIds?: string[];
    viewport?: { x: number; y: number; zoom: number };
    spotlight?: boolean;
    activeShapeIds?: string[];
    activity?: "moving" | "resizing" | "rotating" | "editing" | null;
    cursorChat?: string;
    textSelection?: { shapeId: string; start: number; end: number } | null;
  }[];
  schemaVersion: number;
  revision: number;
  updatedAt: number | null;
}

const initialState: WhiteBoardState = {
  shapes: [],
  id: null,
  roomId: null,
  baseRoomId: null,
  activeBranchId: null,
  activeBranchName: null,
  role: null,
  type: null,
  title: null,
  uid: null,
  sharedWith: [],
  members: {},
  linkedBoards: {},
  backGroundColor: "#313131",
  lastChangedBy: null,
  currentUsers: [],
  schemaVersion: 5,
  revision: 0,
  updatedAt: null,
};

const whiteBoardSlice = createSlice({
  name: "whiteBoard",
  initialState,
  reducers: {
    setWhiteboardData: (
      state,
      action: PayloadAction<Partial<WhiteBoardState>>
    ) => {
      const {
        shapes,
        id,
        roomId,
        baseRoomId,
        activeBranchId,
        activeBranchName,
        role,
        type,
        title,
        uid,
        sharedWith,
        members,
        linkedBoards,
        backGroundColor,
        currentUsers,
        lastChangedBy,
        schemaVersion,
        revision,
        updatedAt,
      } = action.payload;

      if (shapes !== undefined) state.shapes = shapes.map(normalizeShape);
      if (id !== undefined) state.id = id;
      if (roomId !== undefined) {
        state.roomId = roomId;
        if (!state.baseRoomId && roomId?.startsWith("board:")) state.baseRoomId = roomId;
      }
      if (baseRoomId !== undefined) state.baseRoomId = baseRoomId;
      if (activeBranchId !== undefined) state.activeBranchId = activeBranchId;
      if (activeBranchName !== undefined) state.activeBranchName = activeBranchName;
      if (role !== undefined) state.role = role;
      if (type !== undefined) state.type = type;
      if (title !== undefined) state.title = title;
      if (uid !== undefined) state.uid = uid;
      if (sharedWith !== undefined) state.sharedWith = sharedWith;
      if (members !== undefined) state.members = members;
      if (linkedBoards !== undefined) state.linkedBoards = linkedBoards;
      if (backGroundColor !== undefined) state.backGroundColor = backGroundColor;
      if (lastChangedBy !== undefined) state.lastChangedBy = lastChangedBy;
      if (currentUsers !== undefined) state.currentUsers = currentUsers;
      if (schemaVersion !== undefined) state.schemaVersion = schemaVersion;
      if (revision !== undefined) state.revision = revision;
      if (updatedAt !== undefined) state.updatedAt = updatedAt;
    },
    replaceShapes: (state, action: PayloadAction<Shape[]>) => {
      state.shapes = action.payload.map(normalizeShape);
    },
    replaceCollaborativeShapes: (state, action: PayloadAction<Shape[]>) => {
      const previous = new Map(state.shapes.map((shape) => [shape.id, shape]));
      state.shapes = action.payload.map((shape) => {
        const normalized = normalizeShape(shape);
        const existing = previous.get(normalized.id);
        return normalized.assetId && existing?.assetId === normalized.assetId && existing.backgroundImage
          ? { ...normalized, backgroundImage: existing.backgroundImage }
          : normalized;
      });
    },
    hydrateShapeAssets: (
      state,
      action: PayloadAction<Array<{ id: string; assetId: string; url: string }>>
    ) => {
      const hydration = new Map(action.payload.map((asset) => [asset.id, asset]));
      state.shapes = state.shapes.map((shape) => {
        const asset = hydration.get(shape.id);
        return asset && shape.assetId === asset.assetId
          ? { ...shape, backgroundImage: asset.url }
          : shape;
      });
    },
    share: (state, action: PayloadAction<{ uid: string; role: "editor" | "viewer" }>) => {
      if (!state.sharedWith.includes(action.payload.uid)) {
        state.sharedWith.push(action.payload.uid);
      }
      state.members[action.payload.uid] = action.payload.role;
    },
    removeShare: (state, action: PayloadAction<string>) => {
      state.sharedWith = state.sharedWith.filter(
        (uid) => uid !== action.payload
      );
      delete state.members[action.payload];
    },
    updateBackgroundColor: (state, action: PayloadAction<string>) => {
      state.backGroundColor = action.payload;
    },
    updateTitle: (state, action: PayloadAction<string>) => {
      state.title = action.payload;
    },
    updateVisibility: (
      state,
      action: PayloadAction<"private" | "public" | "shared">
    ) => {
      state.type = action.payload;
    },
    setLastChangedBy: (state, action: PayloadAction<string | null>) => {
      state.lastChangedBy = action.payload;
    },
    setCurrentUsers: (
      state,
      action: PayloadAction<WhiteBoardState["currentUsers"]>
    ) => {
      state.currentUsers = action.payload;
    },
  },
});

export const {
  setWhiteboardData,
  replaceShapes,
  replaceCollaborativeShapes,
  hydrateShapeAssets,
  share,
  removeShare,
  updateBackgroundColor,
  updateTitle,
  updateVisibility,
  setLastChangedBy,
  setCurrentUsers,
} = whiteBoardSlice.actions;

export default whiteBoardSlice.reducer;
