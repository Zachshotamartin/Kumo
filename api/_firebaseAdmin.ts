import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";

const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");
const databaseURL = process.env.FIREBASE_ADMIN_DATABASE_URL;

const adminApp = () => {
  if (!projectId || !clientEmail || !privateKey || !databaseURL) {
    throw new Error("Firebase Admin environment variables are incomplete.");
  }
  return getApps()[0] ?? initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    databaseURL,
  });
};

export const adminAuth = () => getAuth(adminApp());
export const adminDatabase = () => getDatabase(adminApp());
