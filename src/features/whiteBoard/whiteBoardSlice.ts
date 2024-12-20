// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface Shape {
  // type (image, text, calendar, rectangle)
  type: string;

  // positioning
  x1: number;
  y1: number;
  x2: number;
  y2: number;

  // dimensions
  width: number;
  height: number;

  // transforms
  rotation?: number;
  flipX?: boolean;
  flipY?: boolean;

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
  textDecoration?: string;
  lineHeight?: number;
  letterSpacing?: number;

  // color styling
  color?: string;
  opacity?: number;
  backgroundColor?: string;
  borderColor?: string;
}

interface WhiteBoardState {
  shapes: Shape[];
  selectedShape: number | null;
}

const initialState: WhiteBoardState = {
  shapes: [],
  selectedShape: null,
};

const whiteBoardSlice = createSlice({
  name: "whiteBoard",
  initialState,
  reducers: {
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
    removeShape: (state, action: PayloadAction<number>) => {
      state.shapes = state.shapes.filter(
        (shape, index) => index !== action.payload
      );
    },
    setSelectedShape: (state, action: PayloadAction<number | null>) => {
      state.selectedShape = action.payload;
    },
  },
});

export const { addShape, updateShape, removeShape, setSelectedShape } =
  whiteBoardSlice.actions;

export default whiteBoardSlice.reducer;
