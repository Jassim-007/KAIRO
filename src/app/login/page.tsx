"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { logIn, sendPasswordReset } from "@/lib/auth";
import AuthFrame, { Alert, Field, PasswordInput, inputClass } from "@/app/components/auth-frame";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    try {
      const user = await logIn(email, password);
      const isPassword = user.providerData.some((p) => p.providerId === "password");
      router.replace(isPassword && !user.emailVerified ? "/verify-email" : "/dashboard");
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : "";
      if (["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password"].includes(code)) setError("Email or password is incorrect.");
      else if (code === "auth/invalid-email") setError("Enter a valid email address.");
      else if (code === "auth/too-many-requests") setError("Too many attempts. Please wait and try again.");
      else {
        setError("Login failed. Please try again.");
        console.error("Login error:", err);
      }
    } finally {
      setLoading(false);
    }
  }

  async function reset() {
    setError("");
    setNotice("");
    if (!email.trim()) {
      setError("Enter your email address first, then choose reset password.");
      return;
    }
    setResetting(true);
    try {
      await sendPasswordReset(email);
      setNotice("If an account exists for that address, Firebase has sent a password reset email.");
    } catch (err) {
      setError(err instanceof FirebaseError && err.code === "auth/invalid-email" ? "Enter a valid email address." : "Could not send a reset email. Please try again.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Welcome back"
      title="Good to see you again."
      subtitle="Pick up right where you left off."
      footer={<>New here? <Link href="/signup" className="font-bold text-periwinkle underline decoration-periwinkle/30 underline-offset-4">Create an account</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Email address"><input required type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="current-password" /></Field>
        {error && <Alert kind="error">{error}</Alert>}
        {notice && <Alert kind="success">{notice}</Alert>}
        <button disabled={loading} className="w-full rounded-full bg-butter px-5 py-4 text-base font-bold text-butter-ink disabled:opacity-60">{loading ? "Logging in…" : "Log in"}</button>
      </form>
      <button type="button" onClick={() => void reset()} disabled={resetting} className="mt-4 w-full text-sm font-semibold text-periwinkle underline decoration-periwinkle/30 underline-offset-4">{resetting ? "Sending reset email…" : "Forgot password? Send reset email"}</button>
    </AuthFrame>
  );
}
