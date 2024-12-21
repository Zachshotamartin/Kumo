// whiteBoardSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface BoardsState {
  privateBoards: ({
    id: string;
    title: string;
    uid: string;
  } | null)[];
  publicBoards: ({
    id: string;
    title: string;
    uid: string;
  } | null)[];
  sharedBoards: ({
    id: string;
    title: string;
    uid: string;
  } | null)[];
}

const initialState: BoardsState = {
  privateBoards: [],
  publicBoards: [],
  sharedBoards: [],
};

const boardsSlice = createSlice({
  name: "boards",
  initialState,
  reducers: {
    setBoards: (state, action: PayloadAction<BoardsState>) => {
      state.privateBoards = action.payload.privateBoards;
      state.publicBoards = action.payload.publicBoards;
      state.sharedBoards = action.payload.sharedBoards;
    },
    addBoard: (
      state,
      action: PayloadAction<{
        board: { id: string; title: string; uid: string };
        type: "private" | "public" | "shared";
      }>
    ) => {
      switch (action.payload.type) {
        case "private":
          state.privateBoards.push(action.payload.board);
          break;
        case "public":
          state.publicBoards.push(action.payload.board);
          break;
        case "shared":
          state.sharedBoards.push(action.payload.board);
          break;
      }
    },
  },
});

export const { setBoards, addBoard } = boardsSlice.actions;

export default boardsSlice.reducer;

export type { BoardsState };
