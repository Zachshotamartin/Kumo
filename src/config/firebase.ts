import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { resolveFirebaseAuthDomain } from "./authDomain";

const browserLocation = typeof window === "undefined" ? undefined : window.location;

/**
 * The browser API key is supplied per environment rather than committed. It is not a secret — it
 * ships in every bundle — but keeping it out of the repository is what lets it be rotated and
 * restricted without a code change, and `validate:vercel-env` fails the pipeline before a
 * deployment can be built without it.
 */
export const resolveFirebaseApiKey = (configuredKey: string | undefined) => configuredKey ?? "";

export const firebaseApiKey = resolveFirebaseApiKey(import.meta.env.VITE_FIREBASE_API_KEY);

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
