
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { auth, authPersistenceReady } from "@/lib/firebase";

export async function signUp(
  name: string,
  email: string,
  password: string,
) {
  await authPersistenceReady;

  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  await updateProfile(credential.user, {
    displayName: name.trim(),
  });

  await sendEmailVerification(credential.user).catch(() => undefined);

  return credential.user;
}

export async function logIn(email: string, password: string) {
  await authPersistenceReady;

  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password,
  );

  return credential.user;
}

export async function resendVerificationEmail() {
  await authPersistenceReady;

  if (!auth.currentUser) {
    throw new Error("Please sign in again to resend verification.");
  }

  await sendEmailVerification(auth.currentUser);
}

export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function logOut() {
  await authPersistenceReady;
  await signOut(auth);
}
