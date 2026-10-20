
import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import serviceAccount from "../../../serviceAccountKey.json";

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!projectId || serviceAccount.project_id !== projectId) {
  throw new Error(
    "Firebase Admin project ID does not match NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
  );
}

const adminApp: App =
  getApps().find((app) => app.name === "fitness-ai-admin") ??
  initializeApp(
    {
      credential: cert(serviceAccount as Parameters<typeof cert>[0]),
      projectId,
    },
    "fitness-ai-admin",
  );

export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
