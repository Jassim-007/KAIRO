"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FirebaseError } from "firebase/app";
import { signUp } from "@/lib/auth";
export default function SignupPage() {
  const router = useRouter(); const [name, setName] = useState(""); const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); if (name.trim().length < 2) { setError("Please enter your name."); return; } if (password.length < 6) { setError("Password must contain at least 6 characters."); return; }
    setLoading(true); try { await signUp(name, email, password); router.replace("/verify-email"); }
    catch (err) { const code = err instanceof FirebaseError ? err.code : ""; if (code === "auth/email-already-in-use") setError("This email already has an account. Please log in."); else if (code === "auth/invalid-email") setError("Enter a valid email address."); else if (code === "auth/weak-password") setError("Choose a stronger password."); else if (code === "auth/operation-not-allowed") setError("Enable Email/Password in Firebase Authentication."); else { setError("Account creation failed. Please try again."); console.error("Signup error:", err); } }
    finally { setLoading(false); }
  }
  return <main className="flex min-h-screen items-center justify-center bg-[#0B0D10] px-5 py-10 text-white"><section className="w-full max-w-md rounded-3xl border border-[#252A32] bg-[#171A20] p-7 sm:p-9"><p className="text-xs font-semibold uppercase tracking-[0.25em] text-[#B8F34A]">FORM/AI</p><h1 className="mt-5 text-3xl font-bold">Create your account</h1><p className="mt-2 text-sm text-[#9AA1AC]">Start building healthier habits together.</p>
    <form onSubmit={handleSubmit} className="mt-8 space-y-4"><label className="block text-sm">Your name<input required minLength={2} autoComplete="name" value={name} onChange={e=>setName(e.target.value)} className="mt-2 w-full rounded-xl border border-[#303641] bg-[#0B0D10] px-4 py-3"/></label><label className="block text-sm">Email address<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 w-full rounded-xl border border-[#303641] bg-[#0B0D10] px-4 py-3"/></label><label className="block text-sm">Password<input required type="password" minLength={6} autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 w-full rounded-xl border border-[#303641] bg-[#0B0D10] px-4 py-3"/></label>{error&&<p role="alert" className="rounded-xl bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}<button disabled={loading} className="w-full rounded-xl bg-[#B8F34A] px-4 py-3 font-semibold text-[#0B0D10] disabled:opacity-60">{loading?"Creating account…":"Create account"}</button></form><p className="mt-6 text-center text-sm text-[#9AA1AC]">Already registered? <Link href="/login" className="font-semibold text-[#B8F34A]">Log in</Link></p></section></main>;
}