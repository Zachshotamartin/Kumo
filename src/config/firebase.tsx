// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBA9pnDobxLfEjNYrxS9H2r8CMwFg_C7Zs",
  authDomain: "kumo-7d8e1.firebaseapp.com",
  projectId: "kumo-7d8e1",
  storageBucket: "kumo-7d8e1.firebasestorage.app",
  messagingSenderId: "646582029074",
  appId: "1:646582029074:web:ac0c0ed979bb19c17781cb",
  measurementId: "G-Y2JRS9B9XV",
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const provider = new GoogleAuthProvider();
const analytics = getAnalytics(app);
