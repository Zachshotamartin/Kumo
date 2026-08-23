import { initializeApp } from "firebase/app";
import { getAnalytics, isSupported } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { resolveFirebaseAuthDomain } from "./authDomain";

const browserLocation = typeof window === "undefined" ? undefined : window.location;

export const firebaseApiKey = import.meta.env.VITE_FIREBASE_API_KEY ?? "AIzaSyBA9pnDobxLfEjNYrxS9H2r8CMwFg_C7Zs";

const firebaseConfig = {
  apiKey: firebaseApiKey,
  authDomain: resolveFirebaseAuthDomain(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN, browserLocation),
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL ?? "https://kumo-7d8e1-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID ?? "kumo-7d8e1",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET ?? "kumo-7d8e1.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? "646582029074",
  appId: import.meta.env.VITE_FIREBASE_APP_ID ?? "1:646582029074:web:ac0c0ed979bb19c17781cb",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID ?? "G-Y2JRS9B9XV",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const provider = new GoogleAuthProvider();

if (typeof window !== "undefined") {
  void isSupported().then((supported) => {
    if (supported) getAnalytics(app);
  });
}
