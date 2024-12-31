/*************  ✨ Codeium Command 🌟  *************/
import React, { useEffect } from "react";
import logo from "./res/logo3.png";
import "./App.css";
import WorkSpace from "./components/workSpace/workSpace";
import HomePage from "./components/homepage/homePage";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./config/firebase";
import { useSelector } from "react-redux";
import { login } from "./features/auth/authSlice";
import MiddleLayer from "./components/middleLayer/middleLayer";
import MiddlePage from "./components/middlePage/middlePage";
function App() {
  const user = useSelector((state: any) => state.auth);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  return (
    <div className="App">
      {!user?.isAuthenticated ? (
        <HomePage />
      ) : whiteBoard.id !== null ? (
        <WorkSpace />
      ) : (
        <MiddlePage />
      )}
    </div>
  );
}

export default App;
