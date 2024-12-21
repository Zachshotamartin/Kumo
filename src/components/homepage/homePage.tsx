/*************  ✨ Codeium Command 🌟  *************/
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

const usersCollectionRef = collection(db, "users");
const HomePage = () => {
  const dispatch = useDispatch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      console.log("logging in");
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      console.log("user created successfully");
      const data = {
        uid: userCredential.user.uid,
        email: userCredential.user.email,
        loginType: "email",
        privateBoardsIds: [],
        publicBoardsIds: [],
        sharedBoardsIds: [],
      };
      await addDoc(usersCollectionRef, data);
      console.log(data);
      dispatch(login({ uid: userCredential.user.uid, email: email }));
    } catch (error: any) {
      if (error.code === "auth/email-already-in-use") {
        try {
          await signInWithEmailAndPassword(auth, email, password);
          dispatch(login({ uid: auth.currentUser?.uid || "", email: email }));
        } catch (signInError) {
          console.error(signInError);
        }
      } else {
        console.error(error);
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
