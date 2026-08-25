import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || "kumo-7d8e1";
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const databaseURL = process.env.FIREBASE_ADMIN_DATABASE_URL;
const VERIFIER_APP_NAME = "kumo-token-verifier";
const PRIVILEGED_APP_NAME = "kumo-privileged-admin";

const existingApp = (name: string) => getApps().find((app) => app.name === name);

const verifierApp = () =>
  existingApp(VERIFIER_APP_NAME) ?? initializeApp({ projectId }, VERIFIER_APP_NAME);

const privilegedApp = () => {
  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error("Firebase Admin environment variables are incomplete.");
  }
  return existingApp(PRIVILEGED_APP_NAME) ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL,
  }, PRIVILEGED_APP_NAME);
};

/** Verifies Firebase ID tokens using the project ID and Google's public keys. */
export const adminAuth = () => getAuth(verifierApp());

/** Performs Firebase user-directory operations that require a service account. */
export const privilegedAdminAuth = () => getAuth(privilegedApp());

/** Reads the legacy Realtime Database during explicit board migrations. */
export const adminDatabase = () => getDatabase(privilegedApp());
