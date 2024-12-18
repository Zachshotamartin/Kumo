/*************  ✨ Codeium Command 🌟  *************/
import React from "react";
import logo from "./res/logo3.png";
import "./App.css";
import WorkSpace from "./components/workSpace/workSpace";
import HomePage from "./components/homepage/homePage";
import { useAuthState } from "react-firebase-hooks/auth";
import { auth } from "./config/firebase";

function App() {
  const [user] = useAuthState(auth);
  return <div className="App">{user ? <WorkSpace /> : <HomePage />}</div>;
}

export default App;
