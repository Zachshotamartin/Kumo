// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface BoardImagesState {
  boardImages: ({
    id: string;
    url: string;
  })[];
}

const initialState: BoardImagesState = {
  boardImages: [],
};

const boardImagesSlice = createSlice({
  name: "boards",
  initialState,
  reducers: {
    addBoardImage: (state, action: PayloadAction<{ id: string, url: string }>) => {
      state.boardImages.push(action.payload);
    }
  },
});

export const { addBoardImage } = boardImagesSlice.actions;

export default boardImagesSlice.reducer;


