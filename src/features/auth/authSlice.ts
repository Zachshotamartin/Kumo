// authSlice.ts
import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AuthState {
  uid: string | null;
  email: string | null;

  isAuthenticated: boolean;
  isInitialized: boolean;
}

const initialState: AuthState = {
  uid: null,
  email: null,
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
      state.email = action.payload.email;
      state.uid = action.payload.uid;
      state.isAuthenticated = true;
      state.isInitialized = true;
    },
    logout(state) {
      state.email = null;
      state.uid = null;
      state.isAuthenticated = false;
      state.isInitialized = true;
    },
    setAuthInitialized(state) {
      state.isInitialized = true;
    },
  },
});

export const { login, logout, setAuthInitialized } = authSlice.actions;

export default authSlice.reducer;
