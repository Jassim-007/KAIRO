import "server-only";

import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function getProjectId(): string {
  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error(
      "Missing FIREBASE_PROJECT_ID or NEXT_PUBLIC_FIREBASE_PROJECT_ID.",
    );
  }

  return projectId;
}

function getServiceAccount(projectId: string): ServiceAccount {
  // Vercel / production environment variables
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (clientEmail && privateKey) {
    return { projectId, clientEmail, privateKey };
  }

  // Local development fallback
  const localKeyPath = join(process.cwd(), "serviceAccountKey.json");

  if (existsSync(localKeyPath)) {
    const raw = JSON.parse(readFileSync(localKeyPath, "utf8")) as {
      project_id?: string;
      client_email?: string;
      private_key?: string;
    };

    if (!raw.project_id || !raw.client_email || !raw.private_key) {
      throw new Error("Firebase Admin service account file is incomplete.");
    }

    if (raw.project_id !== projectId) {
      throw new Error(
        "Firebase Admin credentials do not match the configured project ID.",
      );
    }

    return {
      projectId: raw.project_id,
      clientEmail: raw.client_email,
      privateKey: raw.private_key,
    };
  }

  throw new Error(
    "Firebase Admin credentials are missing. Configure FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY in your deployment environment.",
  );
}

let adminApp: App | undefined;

function getAdminApp(): App {
  if (adminApp) return adminApp;

  const projectId = getProjectId();
  const serviceAccount = getServiceAccount(projectId);
  const existingApp = getApps().find(
    (app) => app.name === "fitness-ai-admin",
  );

  adminApp =
    existingApp ??
    initializeApp(
      {
        credential: cert(serviceAccount),
        projectId,
      },
      "fitness-ai-admin",
    );

  if (adminApp.options.projectId !== projectId) {
    throw new Error(
      "Existing Firebase Admin app does not match the configured project ID.",
    );
  }

  return adminApp;
}

function createLazyService<T extends object>(getService: () => T): T {
  return new Proxy({} as T, {
    get(_target, property) {
      const service = getService();
      const value = Reflect.get(service, property, service) as unknown;
      return typeof value === "function" ? value.bind(service) : value;
    },
  });
}

export const adminAuth = createLazyService<Auth>(() =>
  getAuth(getAdminApp()),
);
export const adminDb = createLazyService<Firestore>(() =>
  getFirestore(getAdminApp()),
);
