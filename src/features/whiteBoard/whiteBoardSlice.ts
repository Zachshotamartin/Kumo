// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../../classes/shape";
import { normalizeShape } from "../../editor/geometry";

export interface WhiteBoardState {
  shapes: Shape[];
  id: string | null;
  type: string | null;
  title: string | null;
  uid: string | null;
  sharedWith: string[];
  members: Record<string, "owner" | "editor" | "viewer">;
  backGroundColor: string;
  lastChangedBy: string | null;
  currentUsers: {
    uid: string;
    label?: string;
    cursorX: number;
    cursorY: number;
  }[];
  schemaVersion: number;
  revision: number;
  updatedAt: number | null;
}

const initialState: WhiteBoardState = {
  shapes: [],
  id: null,
  type: null,
  title: null,
  uid: null,
  sharedWith: [],
  members: {},
  backGroundColor: "#313131",
  lastChangedBy: null,
  currentUsers: [],
  schemaVersion: 2,
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
        type,
        title,
        uid,
        sharedWith,
        members,
        backGroundColor,
        currentUsers,
        lastChangedBy,
        schemaVersion,
        revision,
        updatedAt,
      } = action.payload;

      state.shapes = (shapes ?? []).map(normalizeShape);
      state.id = id ?? null;
      state.type = type ?? null;
      state.title = title ?? null;
      state.uid = uid ?? null;
      state.sharedWith = sharedWith ?? [];
      state.members = members ?? {};
      state.backGroundColor = backGroundColor ?? "#313131";
      state.lastChangedBy = lastChangedBy ?? null;
      state.currentUsers = currentUsers ?? [];
      state.schemaVersion = schemaVersion ?? 2;
      state.revision = revision ?? 0;
      state.updatedAt = updatedAt ?? null;
    },
    replaceShapes: (state, action: PayloadAction<Shape[]>) => {
      state.shapes = action.payload.map(normalizeShape);
    },
    share: (state, action: PayloadAction<string>) => {
      if (!state.sharedWith.includes(action.payload)) {
        state.sharedWith.push(action.payload);
      }
      state.members[action.payload] = "editor";
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
  share,
  removeShare,
  updateBackgroundColor,
  updateTitle,
  updateVisibility,
  setLastChangedBy,
  setCurrentUsers,
} = whiteBoardSlice.actions;

export default whiteBoardSlice.reducer;
