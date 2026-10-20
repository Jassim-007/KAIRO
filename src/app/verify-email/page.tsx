"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, reload, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { logOut, resendVerificationEmail } from "@/lib/auth";
import AuthFrame, { Alert } from "@/app/components/auth-frame";

export default function VerifyEmailPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    if (!u) router.replace("/login");
  }), [router]);

  async function check() {
    if (!user) return;
    setBusy(true);
    setError("");
    try {
      await reload(user);
      if (user.emailVerified) {
        await user.getIdToken(true);
        router.replace("/dashboard");
      } else setNotice("Your email is not verified yet. Open the link in your inbox, then check again.");
    } catch {
      setError("Could not check verification status. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await resendVerificationEmail();
      setNotice("Verification email sent. Check your inbox and spam folder.");
    } catch {
      setError("Could not send the email. Wait a moment and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame eyebrow="One last step" title="Verify your email." subtitle={`We sent a verification link to ${user?.email || "your email address"}. Verify it to continue.`}>
      <div className="space-y-3">
        {notice && <Alert kind="success">{notice}</Alert>}
        {error && <Alert kind="error">{error}</Alert>}
        <button disabled={busy} onClick={() => void check()} className="w-full rounded-full bg-butter px-5 py-4 text-base font-bold text-butter-ink disabled:opacity-60">{busy ? "Checking…" : "I’ve verified my email"}</button>
        <button disabled={busy} onClick={() => void resend()} className="w-full rounded-full border border-line-strong px-5 py-3.5 text-sm font-semibold">Resend verification email</button>
        <button onClick={() => void logOut().then(() => router.replace("/login"))} className="w-full pt-2 text-sm font-semibold text-ink-soft underline decoration-line-strong underline-offset-4">Sign out</button>
      </div>
    </AuthFrame>
  );
}
