// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import { update } from "lodash";

export interface Shape {
  // type (image, text, calendar, rectangle)
  type: string;

  // positioning
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  id: string;
  // dimensions
  width: number;
  height: number;
  level: number;
  // transforms
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;
  shapes?: Shape[];
  // box styling
  borderRadius?: number;
  borderWidth?: number;
  borderStyle?: string;

  // text styling
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string;
  textAlign?: string;
  alignItems?: string;
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;
  rows?: number;

  // color styling
  color?: string;
  opacity?: number;
  backgroundColor?: string;
  borderColor?: string;
  backgroundImage?: string;
  zIndex?: number;
  // recursive whiteboard
  boardId?: string | null;
  title?: string | null;
  uid?: string | null;
}

export interface Component {
  shapes: number[];
}

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

      state.shapes = shapes || [];
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
        state.shapes[index] = { ...state.shapes[index], ...update };
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
