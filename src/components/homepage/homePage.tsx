import React, { useState } from "react";
import styles from "./homePage.module.css";
import { auth, provider } from "../../config/firebase";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { useDispatch } from "react-redux";
import { login } from "../../features/auth/authSlice";
import { db } from "../../config/firebase";
import { addDoc, collection, getDocs, query, where } from "firebase/firestore";
import logo from "../../res/logo3.png";

const usersCollectionRef = collection(db, "users");

const HomePage = () => {
  const dispatch = useDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const data = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        loginType: "email",
        privateBoardsIds: [],
        publicBoardsIds: [],
        sharedBoardsIds: [],
      };
      await addDoc(usersCollectionRef, data);

      dispatch(login({ uid: userCredential.user.uid, email: email }));
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        try {
          const userCredential = await signInWithEmailAndPassword(
            auth,
            email,
            password
          );
          dispatch(
            login({ uid: auth.currentUser?.uid || "", email: email })
          );
        } catch (signInError) {
          setError("Invalid credentials. Please try again.");
        }
      } else {
        setError("An error occurred. Please try again.");
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const userCredential = await signInWithPopup(auth, provider);
      dispatch(
        login({
          uid: auth.currentUser?.uid || "",
          email: auth.currentUser?.email || "",
        })
      );
      const userRef = collection(db, "users");
      const q = query(userRef, where("uid", "==", userCredential.user.uid));
      const querySnapshot = await getDocs(q);
      if (querySnapshot.empty) {
        const data = {
          uid: userCredential.user.uid,
          email: userCredential.user.email,
          loginType: "google",
          privateBoardsIds: [],
          publicBoardsIds: [],
          sharedBoardsIds: [],
        };
        await addDoc(usersCollectionRef, data);
      }
    } catch (err: any) {
      setError(err.message || "An error occurred with Google login.");
    }
  };

  return (
    <div className={styles.homePage}>
      <div className={styles.logo}>
        <img className={styles.icon} src={logo} alt="Kumo logo" />
        <h1 className={styles.logoText}>Kumo</h1>
      </div>
      <form className={styles.loginForm} onSubmit={handleLogin}>
        <div className={styles.loginFormRow}>
          <div className={styles.inputContainer}>
            <label htmlFor="email">Email</label>
            <input
              id="email"
              className={styles.input}
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className={styles.inputContainer}>
            <label htmlFor="password">Password</label>
            <input
              id="password"
              className={styles.input}
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
        </div>
        <div className={styles.loginFormColumn}>
          <button className={styles.submit} type="submit">
            Login
          </button>
          <button
            className={styles.googleButton}
            type="button"
            onClick={handleGoogleLogin}
          >
            Login with Google
          </button>
        </div>
        {error && <p className={styles.error}>{error}</p>}
      </form>
    </div>
  );
};

export default HomePage;