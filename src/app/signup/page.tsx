"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { signUp } from "@/lib/auth";
import AuthFrame, { Alert, Field, PasswordInput, inputClass } from "@/app/components/auth-frame";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (name.trim().length < 2) {
      setError("Please enter your name.");
      return;
    }
    if (password.length < 6) {
      setError("Password must contain at least 6 characters.");
      return;
    }
    setLoading(true);
    try {
      await signUp(name, email, password);
      router.replace("/verify-email");
    } catch (err) {
      const code = err instanceof FirebaseError ? err.code : "";
      if (code === "auth/email-already-in-use") setError("This email already has an account. Please log in.");
      else if (code === "auth/invalid-email") setError("Enter a valid email address.");
      else if (code === "auth/weak-password") setError("Choose a stronger password.");
      else if (code === "auth/operation-not-allowed") setError("Enable Email/Password in Firebase Authentication.");
      else {
        setError("Account creation failed. Please try again.");
        console.error("Signup error:", err);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthFrame
      eyebrow="Let’s begin"
      title="Create your account."
      subtitle="Start building healthier habits together."
      footer={<>Already registered? <Link href="/login" className="font-bold text-periwinkle underline decoration-periwinkle/30 underline-offset-4">Log in</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <Field label="Your name"><input required minLength={2} autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} /></Field>
        <Field label="Email address"><input required type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputClass} /></Field>
        <Field label="Password"><PasswordInput value={password} onChange={setPassword} autoComplete="new-password" minLength={6} /></Field>
        <p className="-mt-1 text-xs text-ink-mute">At least 6 characters.</p>
        {error && <Alert kind="error">{error}</Alert>}
        <button disabled={loading} className="w-full rounded-full bg-butter px-5 py-4 text-base font-bold text-butter-ink disabled:opacity-60">{loading ? "Creating account…" : "Create account"}</button>
      </form>
            <p className="mt-5 text-center text-xs text-ink-soft">
        By creating an account, you acknowledge our{" "}
        <Link
          href="/privacy"
          className="font-semibold text-periwinkle underline decoration-periwinkle/30 underline-offset-4"
        >
          Privacy Notice
        </Link>
        .
      </p>
    </AuthFrame>
  );
}
