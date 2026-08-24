// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  uid: string | null;
  email: string | null;
  displayName: string | null;
  username: string | null;
  avatarUrl: string | null;

  isAuthenticated: boolean;
  isInitialized: boolean;
}

const initialState: AuthState = {
  uid: null,
  email: null,
  displayName: null,
  username: null,
  avatarUrl: null,
  isAuthenticated: false,
  isInitialized: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    login(
      state,
      action: PayloadAction<{
        uid: string;
        email: string;
      }>
    ) {
      if (state.uid !== action.payload.uid) {
        state.displayName = null;
        state.username = null;
        state.avatarUrl = null;
      }
      state.email = action.payload.email;
      state.uid = action.payload.uid;
      state.isAuthenticated = true;
      state.isInitialized = true;
    },
    setAuthenticatedProfile(
      state,
      action: PayloadAction<{
        displayName: string;
        username: string;
        avatarUrl: string | null;
      }>
    ) {
      state.displayName = action.payload.displayName;
      state.username = action.payload.username;
      state.avatarUrl = action.payload.avatarUrl;
    },
    logout(state) {
      state.email = null;
      state.uid = null;
      state.displayName = null;
      state.username = null;
      state.avatarUrl = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
    },
    setAuthInitialized(state) {
      state.isInitialized = true;
    },
  },
});

export const { login, logout, setAuthenticatedProfile, setAuthInitialized } = authSlice.actions;

export default authSlice.reducer;
