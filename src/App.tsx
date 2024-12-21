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
function App() {
  const user = useSelector((state: any) => state.auth.user);
  const whiteBoard = useSelector((state: any) => state.whiteBoard);
  return (
    <div className="App">
      {!user ? (
        <HomePage />
      ) : whiteBoard.id !== null ? (
        <WorkSpace />
      ) : (
        <MiddleLayer />
      )}
    </div>
  );
}

export default App;
