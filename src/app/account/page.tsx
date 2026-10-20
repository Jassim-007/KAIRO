
"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";

import { auth } from "@/lib/firebase";
import { logOut, resendVerificationEmail } from "@/lib/auth";

const input =
  "mt-2 w-full rounded-2xl border border-line bg-field px-3 py-3 text-ink";

async function finishDeletedAccount() {
  // Keep the login page from redirecting a still-cached, now-deleted Firebase
  // user back into the app if local sign-out is delayed.
  window.sessionStorage.setItem("account-deletion-complete", "true");

  // Firebase signOut may wait behind persistence initialization. Start it and
  // give it a bounded window to clear the local session, but never make
  // leaving this page depend on that persistence work finishing.
  let timeout: number | undefined;
  const signOutAttempt = signOut(auth).catch(() => undefined);
  await Promise.race([
    signOutAttempt,
    new Promise<void>((resolve) => {
      timeout = window.setTimeout(resolve, 1500);
    }),
  ]);
  if (timeout !== undefined) window.clearTimeout(timeout);

  // A full navigation also discards the page's in-flight auth listener and
  // avoids depending on a client-side route transition after account removal.
  window.location.replace("/login");
}

export default function AccountPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [photoURL, setPhotoURL] = useState("");
  const [gender, setGender] = useState("");
  const [password, setPassword] = useState("");
  const [profileError, setProfileError] = useState("");
  const [profileNotice, setProfileNotice] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const [deletionError, setDeletionError] = useState("");
  const [deletionNotice, setDeletionNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletionPending, setDeletionPending] = useState(false);

  const isPassword = !!user?.providerData.some(
    (provider) => provider.providerId === "password",
  );

  useEffect(() => {
    return onAuthStateChanged(auth, async (current) => {
      setUser(current);

      if (!current) {
        router.replace("/login");
        return;
      }

      setName(current.displayName || "");
      setPhotoURL(current.photoURL || "");

      try {
        const token = await current.getIdToken();

        const response = await fetch("/api/account/profile", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        // A 410 means a durable deletion job is blocking normal account APIs.
        // Keep this screen available so the authenticated user can resume it.
        if (response.status === 410) {
          setDeletionPending(true);
          setDeletionNotice(
            "Account deletion is in progress. Confirm your identity below to safely resume and finish deletion.",
          );
        } else if (response.ok) {
          const data = await response.json();
          setGender(data.gender || "");
          setPhotoURL(data.photoURL || current.photoURL || "");
        }
      } catch {
        // Keep the existing profile values if loading fails.
      } finally {
        setLoading(false);
      }
    });
  }, [router]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!user) return;

    setProfileError("");
    setProfileNotice("");
    setSaving(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ displayName: name, photoURL, gender }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Could not save profile.");
      }

      await updateProfile(user, {
        displayName: name.trim(),
        photoURL: photoURL.trim() || null,
      });

      await user.reload();
      setUser(auth.currentUser);
      setProfileNotice("Profile saved.");
    } catch (e) {
      setProfileError(
        e instanceof Error ? e.message : "Could not save profile.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function resend() {
    setProfileError("");
    setProfileNotice("");

    try {
      await resendVerificationEmail();
      setProfileNotice(
        "Verification email sent. Check your inbox and spam folder.",
      );
    } catch {
      setProfileError("Could not send a verification email. Please try again.");
    }
  }

  async function downloadExport() {
    if (!user) return;

    setExportError("");
    setExportNotice("");
    setExporting(true);

    try {
      const token = await user.getIdToken();

      const response = await fetch("/api/account/export", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || "Could not export your data.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = "fitness-data.json";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      setExportNotice("Your personal data export was downloaded.");
    } catch (e) {
      setExportError(
        e instanceof Error ? e.message : "Could not export your data.",
      );
    } finally {
      setExporting(false);
    }
  }

  async function removeAccount() {
    if (!user) return;

    const confirmed = window.confirm(
      "Permanently delete your account and personal fitness data? If you own a workspace, the workspace and its shared data will also be deleted. If you are a member, only your own shared records and membership will be removed. This action cannot be undone.",
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeletionError("");
    setDeletionNotice(
      deletionPending
        ? "Resuming account deletion and finishing saved cleanup…"
        : "Deleting your account and personal data. This can take several minutes for a workspace…",
    );
    let deletionRequestStarted = false;

    try {
      const provider = user.providerData.find(
        (p) => p.providerId === "password",
      );

      if (provider) {
        if (!password) {
          throw new Error(
            "Enter your current password to confirm deletion.",
          );
        }

        const credential = EmailAuthProvider.credential(
          user.email || "",
          password,
        );

        await reauthenticateWithCredential(user, credential);
      } else if (
        user.providerData.some((p) => p.providerId === "google.com")
      ) {
        await reauthenticateWithPopup(user, new GoogleAuthProvider());
      } else {
        throw new Error(
          "Sign out and sign in again before deleting your account.",
        );
      }

      const token = await user.getIdToken(true);

      deletionRequestStarted = true;
      const controller = new AbortController();
      const requestTimeout = window.setTimeout(() => controller.abort(), 120_000);
      const slowRequestNotice = window.setTimeout(() => {
        setDeletionNotice("Deletion is taking longer than expected. Keep this page open while the server finishes cleanup…");
      }, 45_000);
      let response: Response;
      try {
        response = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
      } catch (requestError) {
        if (requestError instanceof DOMException && requestError.name === "AbortError") {
          throw new Error("The deletion request took over two minutes without a response. The server may still be finishing cleanup; return to Account settings and retry if deletion remains in progress.");
        }
        throw requestError;
      } finally {
        window.clearTimeout(requestTimeout);
        window.clearTimeout(slowRequestNotice);
      }

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status >= 500 || response.status === 409 || response.status === 410) {
          setDeletionPending(true);
        }
        throw new Error(data.error || "Could not delete account.");
      }

      // The server has completed deletion. Transition the UI before local
      // sign-out, which may be delayed by Firebase persistence readiness.
      setDeleting(false);
      setDeletionNotice("Account deleted. Signing you out…");
      await finishDeletedAccount();
    } catch (e) {
      setDeletionNotice("");
      if (deletionRequestStarted) setDeletionPending(true);
      const code = e instanceof FirebaseError ? e.code : "";

      setDeletionError(
        code === "auth/wrong-password" ||
          code === "auth/invalid-credential"
          ? "The password is incorrect."
          : e instanceof Error
            ? e.message
            : "Could not delete account.",
      );
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen p-8 text-ink-soft">
        Loading account…
      </main>
    );
  }

  return (
    <main className="min-h-screen text-ink">
      <header className="flex items-center justify-between px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8">
        <p className="text-sm text-ink-soft">Account settings</p>

        <button
          onClick={() =>
            void logOut().then(() => router.replace("/login"))
          }
          className="rounded-xl border border-line px-3 py-2 text-xs"
        >
          Sign out
        </button>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 py-7 sm:px-8">
        {/* Privacy notice */}
        <section className="rounded-3xl border border-line card p-5">
          <h2 className="font-semibold">Privacy &amp; data</h2>

          <p className="mt-2 text-sm text-ink-soft">
            Learn how KAIRO handles your fitness data, partner sharing,
            AI processing, and account deletion.
          </p>

          <Link
            href="/privacy"
            className="mt-3 inline-block text-sm font-semibold text-periwinkle underline decoration-periwinkle/30 underline-offset-4"
          >
            Read Privacy Notice →
          </Link>
        </section>

        {/* Profile */}
        <section className="rounded-3xl border border-line card p-5">
          <h1 className="text-2xl font-bold">Your profile</h1>

          <p className="mt-2 text-sm text-ink-soft">{user?.email}</p>

          <form onSubmit={save} className="mt-5 space-y-4">
            <label className="block text-sm text-ink-soft">
              Display name
              <input
                required
                minLength={2}
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={input}
              />
            </label>

            <label className="block text-sm text-ink-soft">
              Profile photo URL{" "}
              <span className="text-ink-mute">(optional)</span>
              <input
                type="url"
                value={photoURL}
                onChange={(e) => setPhotoURL(e.target.value)}
                placeholder="https://…"
                className={input}
              />
            </label>

            <label className="block text-sm text-ink-soft">
              Gender <span className="text-ink-mute">(optional)</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className={input}
              >
                <option value="">Not specified</option>
                <option value="female">Female</option>
                <option value="male">Male</option>
                <option value="nonbinary">Non-binary</option>
                <option value="prefer_not_to_say">
                  Prefer not to say
                </option>
              </select>
            </label>

            {profileError && (
              <p
                role="alert"
                className="rounded-2xl bg-danger/10 p-3 text-sm text-danger"
              >
                {profileError}
              </p>
            )}

            {profileNotice && (
              <p
                role="status"
                className="rounded-2xl bg-sage/15 p-3 text-sm text-success"
              >
                {profileNotice}
              </p>
            )}

            <button
              disabled={saving}
              className="rounded-2xl bg-butter px-5 py-3 font-bold text-butter-ink"
            >
              {saving ? "Saving…" : "Save profile"}
            </button>
          </form>
        </section>

        {/* Email verification */}
        {isPassword && (
          <section className="rounded-3xl border border-line card p-5">
            <h2 className="font-semibold">Email verification</h2>

            <p className="mt-2 text-sm text-ink-soft">
              {user?.emailVerified
                ? "Your email is verified."
                : "Your email is not verified yet."}
            </p>

            {!user?.emailVerified && (
              <button
                onClick={() => void resend()}
                className="mt-3 rounded-2xl border border-line px-4 py-2 text-sm"
              >
                Resend verification email
              </button>
            )}
          </section>
        )}

        {/* Data export */}
        <section className="rounded-3xl border border-line card p-5">
          <h2 className="font-semibold">Your data</h2>

          <p className="mt-2 text-sm text-ink-soft">
            Download a JSON copy of your profile, private fitness records,
            goals, workout plan, exercise library, and saved AI chat memory.
            The export includes shared workout records about you; it does
            not include another member’s personal records.
          </p>

          {exportError && (
            <p
              role="alert"
              className="mt-3 rounded-2xl bg-danger/10 p-3 text-sm text-danger"
            >
              {exportError}
            </p>
          )}

          {exportNotice && (
            <p
              role="status"
              className="mt-3 rounded-2xl bg-sage/15 p-3 text-sm text-success"
            >
              {exportNotice}
            </p>
          )}

          <button
            disabled={exporting}
            onClick={() => void downloadExport()}
            className="mt-4 rounded-2xl border border-line px-4 py-3 text-sm disabled:opacity-50"
          >
            {exporting ? "Preparing export…" : "Download my data (JSON)"}
          </button>
        </section>

        {/* Account deletion */}
        <section className="rounded-3xl border border-danger/25 card p-5">
          <h2 className="font-semibold text-danger">Delete account</h2>

          <p className="mt-2 text-sm leading-6 text-ink-soft">
            Deleting your account is permanent and requires a recent sign-in. Your
            personal fitness records, profile data, saved AI memory, and Firebase
            sign-in will be deleted. If you own a workspace, its shared records,
            invitations, and memberships will also be deleted. If you are a
            workspace member, only your membership and records attributed to you
            will be removed; the workspace and other members&apos; records remain.
            Solo accounts can be deleted without a workspace.
          </p>

          {isPassword && (
            <label className="mt-4 block text-sm text-ink-soft">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
            </label>
          )}

          {deletionError && (
            <p
              role="alert"
              className="mt-3 rounded-2xl bg-danger/10 p-3 text-sm text-danger"
            >
              {deletionError}
            </p>
          )}

          {deletionNotice && (
            <p
              role="status"
              aria-live="polite"
              className="mt-3 rounded-2xl bg-sage/15 p-3 text-sm text-success"
            >
              {deletionNotice}
            </p>
          )}

          <button
            disabled={deleting}
            onClick={() => void removeAccount()}
            className="mt-4 rounded-2xl border border-danger/30 px-4 py-3 text-sm text-danger disabled:opacity-50"
          >
            {deleting
              ? deletionPending
                ? "Resuming deletion…"
                : "Deleting account…"
              : deletionPending
                ? "Resume account deletion"
                : "Permanently delete account"}
          </button>
        </section>
      </div>
    </main>
  );
}
