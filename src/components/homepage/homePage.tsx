/*************  ✨ Codeium Command 🌟  *************/
import React, { useState } from "react";
import styles from "./homePage.module.css";
import { auth, provider } from "../../config/firebase";
import { signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
const HomePage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className={styles.homePage}>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit">Login</button>
        <button type="button" onClick={handleGoogleLogin}>
          Login with Google
        </button>
        {error && <p>{error}</p>}
      </form>
    </div>
  );
};

export default HomePage;
