
import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectId =
  process.env.FIREBASE_PROJECT_ID ||
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

function getServiceAccount(): ServiceAccount {
  // Vercel / production environment variables
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey,
    };
  }

  // Local development fallback
  const localKeyPath = join(process.cwd(), "serviceAccountKey.json");

  if (existsSync(localKeyPath)) {
    const raw = JSON.parse(readFileSync(localKeyPath, "utf8")) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    const credentials: ServiceAccount = {
      projectId: raw.project_id,
      clientEmail: raw.client_email,
      privateKey: raw.private_key,
    };

    if (credentials.projectId !== projectId) {
      throw new Error(
        "Firebase Admin credentials do not match the configured project ID.",
      );
    }

    return credentials;
  }

  throw new Error(
    "Firebase Admin credentials are missing. Configure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in your deployment environment.",
  );
}

if (!projectId) {
  throw new Error(
    "Missing FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
  );
}

const existingApp = getApps().find(
  (app) => app.name === "fitness-ai-admin",
);

const adminApp: App =
  existingApp ??
  initializeApp(
    {
      credential: cert(getServiceAccount()),
      projectId,
    },
    "fitness-ai-admin",
  );

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
