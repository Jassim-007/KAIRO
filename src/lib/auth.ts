import { createUserWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, updateProfile } from "firebase/auth";
import { auth } from "@/lib/firebase";
export async function signUp(name: string, email: string, password: string) {
  const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
  await updateProfile(credential.user, { displayName: name.trim() });
  await sendEmailVerification(credential.user).catch(() => undefined);
  return credential.user;
}
export async function logIn(email: string, password: string) {
  const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
  return credential.user;
}
export async function resendVerificationEmail() {
  if (!auth.currentUser) throw new Error("Please sign in again to resend verification.");
  await sendEmailVerification(auth.currentUser);
}
export async function sendPasswordReset(email: string) {
  await sendPasswordResetEmail(auth, email.trim());
}
export async function logOut() { await signOut(auth); }