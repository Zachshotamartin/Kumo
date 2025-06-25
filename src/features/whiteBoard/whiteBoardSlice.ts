// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { Shape } from "../../classes/shape";

interface WhiteBoardState {
  shapes: Shape[];
  id: string | null;
  type: string | null;
  title: string | null;
  uid: string | null;
  sharedWith: string[];
  backGroundColor: string;
  lastChangedBy: string | null;
  currentUsers: {
    uid: string;
    cursorX: number;
    cursorY: number;
  }[];
}

const initialState: WhiteBoardState = {
  shapes: [],
  id: null,
  type: null,
  title: null,
  uid: null,
  sharedWith: [],
  backGroundColor: "#313131",
  lastChangedBy: null,
  currentUsers: [],
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
        backGroundColor,
        currentUsers,
      } = action.payload;

      state.shapes =
        shapes?.map((shape) => {
          return shape;
        }) || [];
      state.id = id || null;
      state.type = type || null;
      state.title = title || null;
      state.uid = uid || null;
      state.sharedWith = sharedWith || [];
      state.backGroundColor = backGroundColor || "#313131";
      state.lastChangedBy = uid || null;
      state.currentUsers = currentUsers || [];
    },
    addShape: (state, action: PayloadAction<Shape>) => {
      state.shapes.push(action.payload);
    },
    updateShape: (
      state,
      action: PayloadAction<{ index: number; update: Partial<Shape> }>
    ) => {
      const { index, update } = action.payload;
      if (state.shapes[index]) {
        // Directly mutate the shape properties using Immer
        Object.entries(update).forEach(([key, value]) => {
          if (value !== undefined && state.shapes[index]) {
            (state.shapes[index] as any)[key] = value;
          }
        });
      }
    },
    removeShape: (state, action: PayloadAction<Shape>) => {
      state.shapes = state.shapes.filter(
        (shape, index) => shape.id !== action.payload.id
      );
    },
    share: (state, action: PayloadAction<string>) => {
      if (!state.sharedWith.includes(action.payload)) {
        state.sharedWith.push(action.payload);
      }
    },
    removeShare: (state, action: PayloadAction<string>) => {
      state.sharedWith = state.sharedWith.filter(
        (uid) => uid !== action.payload
      );
    },
    updateBackgroundColor: (state, action: PayloadAction<string>) => {
      state.backGroundColor = action.payload;
    },
  },
});

export const {
  setWhiteboardData,
  addShape,
  updateShape,
  removeShape,
  share,
  removeShare,
  updateBackgroundColor,
} = whiteBoardSlice.actions;

export default whiteBoardSlice.reducer;
