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
  searchableBoards: ({
    id: string;
    title: string;
    uid: string;
  } | null)[];
  resultsBoards: ({
    id: string;
    title: string;
    uid: string;
  } | null)[];
}

const initialState: BoardsState = {
  privateBoards: [],
  publicBoards: [],
  sharedBoards: [],
  searchableBoards: [],
  resultsBoards: [],
};

const boardsSlice = createSlice({
  name: "boards",
  initialState,
  reducers: {
    setBoards: (
      state,
      action: PayloadAction<{
        privateBoards: any[];
        publicBoards: any[];
        sharedBoards: any[];
      }>
    ) => {
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
    setSearchableBoards: (
      state,
      action: PayloadAction<{
        boards: any[];
      }>
    ) => {
      console.log("raaaa", action.payload.boards);
      state.searchableBoards = action.payload.boards;
    },
    setResultsBoards: (
      state,
      action: PayloadAction<{
        boards: any[];
      }>
    ) => {
      console.log("reeee", action.payload.boards);
      state.resultsBoards = action.payload.boards;
      console.log("state", state.resultsBoards);
    },
  },
});

export const { setBoards, addBoard, setSearchableBoards, setResultsBoards } =
  boardsSlice.actions;

export default boardsSlice.reducer;

export type { BoardsState };
