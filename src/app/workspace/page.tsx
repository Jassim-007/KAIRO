
"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";

type Member = {
  uid: string;
  displayName: string;
  email: string | null;
  role: string;
  joinedAt: string | null;
};

type SharedWorkout = {
  id: string;
  date: string;
  workoutType: string;
  subjectUid: string | null;
  subjectName: string | null;
  loggedBy: string | null;
  notes: string;
  exercises: { name: string; sets: number; reps: number; weightKg: number }[];
};
type SharedMeal = { id: string; date: string; loggedBy: string; loggedByName: string; foodName: string; mealType: string; servings: number; calories: number; protein: number; carbs: number; fat: number; notes: string };
type SharedWater = { id: string; date: string; loggedBy: string; loggedByName: string; amountMl: number; notes: string };
type SharedWeight = { id: string; date: string; subjectUid: string; subjectName: string; weightKg: number; notes: string };
type SharedDay = { nutrition: SharedMeal[]; water: SharedWater[]; weight: SharedWeight[]; workouts: SharedWorkout[] };

type WorkspaceInfo = {
  id: string;
  name: string;
  memberCount: number;
};

type ApiError = {
  error?: string;
};

export default function WorkspacePage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [sharedDay, setSharedDay] = useState<SharedDay>({ nutrition: [], water: [], weight: [], workouts: [] });
  const [selectedDate, setSelectedDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  });

  const [joinCode, setJoinCode] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [inviteExpiresAt, setInviteExpiresAt] = useState("");

  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);

      if (!currentUser) {
        router.replace("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const apiRequest = useCallback(
    async (path: string, body?: object) => {
      if (!user) {
        throw new Error("Please sign in again.");
      }

      const token = await user.getIdToken();

      const response = await fetch(path, {
        method: body ? "POST" : "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store",
      });

      const data = (await response.json().catch(() => ({}))) as ApiError &
        Record<string, unknown>;

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      return data;
    },
    [user],
  );

  const loadWorkspace = useCallback(async () => {
    setChecking(true);
    setError("");

    try {
      const data = await apiRequest(`/api/workspace/members?date=${encodeURIComponent(selectedDate)}`);

      const loadedWorkspace = data.workspace as WorkspaceInfo;
      const loadedMembers = data.members as Member[];

      setWorkspace(loadedWorkspace);
      setMembers(loadedMembers);
      const loadedDay = data.sharedActivity as SharedDay | undefined;
      setSharedDay({ nutrition: loadedDay?.nutrition ?? [], water: loadedDay?.water ?? [], weight: loadedDay?.weight ?? [], workouts: loadedDay?.workouts ?? [] });
    } catch (err) {
      setWorkspace(null);
      setMembers([]);
      setSharedDay({ nutrition: [], water: [], weight: [], workouts: [] });

      if (
        err instanceof Error &&
        !err.message.toLowerCase().includes("haven't joined") &&
        !err.message.toLowerCase().includes("dont belong")
      ) {
        setError(err.message);
      }
    } finally {
      setChecking(false);
    }
  }, [apiRequest, selectedDate]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [user, loadWorkspace]);

  async function createWorkspace() {
    setLoading(true);
    setError("");
    setMessage("");
    setInviteCode("");
    setInviteExpiresAt("");

    try {
      const data = await apiRequest("/api/workspace/create", {});

      setMessage("Workspace created successfully!");
      setInviteCode(String(data.inviteCode ?? ""));
      setInviteExpiresAt(String(data.expiresAt ?? ""));

      await loadWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not create workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function generateInviteCode() {
    setLoading(true);
    setError("");
    setMessage("");
    setInviteCode("");
    setInviteExpiresAt("");

    try {
      const data = await apiRequest("/api/workspace/invite", {});

      setInviteCode(String(data.inviteCode ?? ""));
      setInviteExpiresAt(String(data.expiresAt ?? ""));
      setMessage("Invite created! Send this code privately to your training partner.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not generate an invite code.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function joinWorkspace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    setLoading(true);
    setError("");
    setMessage("");

    try {
      await apiRequest("/api/workspace/join", {
        inviteCode: joinCode.trim().toUpperCase(),
      });

      setJoinCode("");
      setMessage("You joined the shared fitness space!");

      await loadWorkspace();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not join workspace.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function copyInviteCode() {
    if (!inviteCode) return;

    try {
      await navigator.clipboard.writeText(inviteCode);
      setMessage("Invite code copied to clipboard!");
      setError("");
    } catch {
      setMessage("Select the displayed invite code and copy it manually.");
    }
  }

  if (authLoading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center text-ink-soft">
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-periwinkle/25 border-t-periwinkle" />
          Checking your account...
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen px-5 py-8 text-ink sm:px-8">
      
      <div className="mx-auto max-w-4xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-sm text-ink-soft transition hover:text-periwinkle"
          >
            ← Back to dashboard
          </button>

          <span className="rounded-full border border-periwinkle/25 bg-periwinkle/[0.07] px-3 py-2 text-xs text-periwinkle">
            <span className="mr-2 inline-block h-2 w-2 rounded-full bg-butter" />
            Shared fitness space
          </span>
        </header>

        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-periwinkle">
          TRAIN TOGETHER
        </p>

        <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
          Your people. Your progress
          <span className="text-periwinkle">.</span>
        </h1>

        <p className="mt-3 max-w-2xl text-sm leading-6 text-ink-soft">
          Create a shared fitness space for you and your training partner. Both
          accounts can participate once they have joined the same workspace.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-2xl border border-danger/25 bg-danger/10 p-4 text-sm text-danger"
          >
            {error}
          </div>
        )}

        {message && (
          <div
            role="status"
            className="mt-6 rounded-2xl border border-periwinkle/25 bg-periwinkle/[0.07] p-4 text-sm text-periwinkle"
          >
            {message}
          </div>
        )}

        {inviteCode && (
          <section className="mt-6 rounded-3xl border border-periwinkle/30 card bg-lavender/35 p-5 sm:p-7">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-periwinkle">
              PRIVATE INVITE CODE
            </p>

            <p className="mt-2 text-sm text-ink-soft">
              Send this code privately to your partner. It can be used once
              and expires after 24 hours.
            </p>

            <div className="mt-5 rounded-2xl border border-periwinkle/20 bg-field p-4">
              <p className="break-all font-mono text-2xl font-bold tracking-[0.15em] text-periwinkle sm:text-3xl">
                {inviteCode}
              </p>
            </div>

            {inviteExpiresAt && (
              <p className="mt-3 text-xs text-ink-mute">
                Expires: {new Date(inviteExpiresAt).toLocaleString()}
              </p>
            )}

            <button
              onClick={() => void copyInviteCode()}
              className="mt-4 w-full rounded-2xl bg-butter px-4 py-3 text-sm font-bold text-butter-ink transition hover:bg-butter-hover sm:w-auto"
            >
              Copy invite code
            </button>
          </section>
        )}

        {checking ? (
          <div className="mt-8 rounded-3xl border border-line card p-6 text-sm text-ink-soft">
            Checking your workspace...
          </div>
        ) : workspace ? (
          <section className="mt-8 rounded-3xl border border-periwinkle/25 card p-6 sm:p-8">
            <p className="text-xs uppercase tracking-[0.2em] text-ink-mute">
              YOUR WORKSPACE
            </p>

            <h2 className="mt-2 text-2xl font-bold">{workspace.name}</h2>

            <p className="mt-2 text-sm text-ink-soft">
              {members.length} of 2 members connected
            </p>

            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              {members.map((member) => (
                <div
                  key={member.uid}
                  className="rounded-2xl border border-line bg-sunken p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-periwinkle/10 font-bold text-periwinkle">
                      {(member.displayName || "M").charAt(0).toUpperCase()}
                    </div>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {member.displayName || "Member"}
                        {member.uid === user.uid ? " (You)" : ""}
                      </p>

                      <p className="truncate text-xs text-ink-mute">
                        {member.email || "Email unavailable"}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] uppercase tracking-wider text-periwinkle">
                    {member.role}
                  </p>
                </div>
              ))}
            </div>

            <p className="mt-5 text-xs leading-5 text-ink-mute">
              Your shared log shows your partner’s food, nutrition, water, body-weight, and workout records. Your personal records remain in your own trackers.
            </p>

            <div className="mt-7 border-t border-line pt-6">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-periwinkle">Together</p>
                  <h3 className="mt-1 text-xl font-bold">Your partner’s daily log</h3>
                  <p className="mt-1 text-sm text-ink-soft">A daily view of your partner’s food and macros, hydration, body weight, and training.</p>
                </div>
                <label className="text-xs text-ink-soft">Activity date<input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} className="ml-2 rounded-xl border border-line bg-field px-3 py-2 text-sm text-ink" /></label>
              </div>

              {checking ? <p className="mt-5 rounded-2xl border border-line p-5 text-sm text-ink-soft">Loading both members’ logs…</p> : <div className="mt-5 space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">{members.filter((member) => member.uid !== user.uid).map((member) => {
                  const meals = sharedDay.nutrition.filter((entry) => entry.loggedBy === member.uid);
                  const waterMl = sharedDay.water.filter((entry) => entry.loggedBy === member.uid).reduce((sum, entry) => sum + entry.amountMl, 0);
                  const workouts = sharedDay.workouts.filter((entry) => entry.subjectUid === member.uid);
                  const calories = meals.reduce((sum, entry) => sum + entry.calories, 0);
                  const protein = meals.reduce((sum, entry) => sum + entry.protein, 0);
                  const carbs = meals.reduce((sum, entry) => sum + entry.carbs, 0);
                  const fat = meals.reduce((sum, entry) => sum + entry.fat, 0);
                  const latestWeight = sharedDay.weight.filter((entry) => entry.subjectUid === member.uid).at(-1);
                  return <article key={member.uid} className="rounded-2xl border border-line bg-sunken p-4"><h4 className="font-semibold">{member.displayName}{member.uid === user.uid ? " · You" : ""}</h4><div className="mt-3 grid grid-cols-2 gap-2 text-xs"><div className="rounded-xl bg-sunken p-3"><span className="text-ink-mute">Calories</span><p className="mt-1 text-base font-semibold">{Math.round(calories)} kcal</p></div><div className="rounded-xl bg-sunken p-3"><span className="text-ink-mute">Macros</span><p className="mt-1 font-medium">P {Math.round(protein)} · C {Math.round(carbs)} · F {Math.round(fat)} g</p></div><div className="rounded-xl bg-sunken p-3"><span className="text-ink-mute">Water</span><p className="mt-1 text-base font-semibold">{(waterMl / 1000).toFixed(2)} L</p></div><div className="rounded-xl bg-sunken p-3"><span className="text-ink-mute">Body weight</span><p className="mt-1 text-base font-semibold">{latestWeight ? `${latestWeight.weightKg} kg` : "No log"}</p></div><div className="col-span-2 rounded-xl bg-sunken p-3"><span className="text-ink-mute">Workouts</span><p className="mt-1 text-base font-semibold">{workouts.length} {workouts.length === 1 ? "session" : "sessions"}</p></div></div></article>;
                })}</div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className="rounded-2xl border border-line bg-sunken p-4"><h4 className="font-semibold">Food & nutrition <span className="text-xs font-normal text-ink-mute">· {sharedDay.nutrition.length} entries</span></h4>{sharedDay.nutrition.length ? <div className="mt-3 space-y-2">{sharedDay.nutrition.map((meal) => <article key={meal.id} className="rounded-xl bg-sunken p-3"><div className="flex justify-between gap-3"><p className="font-medium">{meal.foodName} <span className="text-xs text-ink-mute">· {meal.mealType}</span></p><span className="whitespace-nowrap text-sm text-periwinkle">{Math.round(meal.calories)} kcal</span></div><p className="mt-1 text-xs text-ink-soft">{meal.loggedByName} · P {Math.round(meal.protein)} g · C {Math.round(meal.carbs)} g · F {Math.round(meal.fat)} g</p>{meal.notes && <p className="mt-1 text-xs text-ink-mute">{meal.notes}</p>}</article>)}</div> : <p className="mt-3 text-sm text-ink-mute">No food entries for this date.</p>}</section>
                  <section className="rounded-2xl border border-line bg-sunken p-4"><h4 className="font-semibold">Water <span className="text-xs font-normal text-ink-mute">· {sharedDay.water.length} entries</span></h4>{sharedDay.water.length ? <div className="mt-3 space-y-2">{sharedDay.water.map((entry) => <p key={entry.id} className="rounded-xl bg-sunken p-3 text-sm"><span className="font-medium">{entry.loggedByName}</span> · {entry.amountMl.toLocaleString()} ml{entry.notes ? <span className="block pt-1 text-xs text-ink-mute">{entry.notes}</span> : null}</p>)}</div> : <p className="mt-3 text-sm text-ink-mute">No water entries for this date.</p>}
                    <h4 className="mt-5 font-semibold">Body weight <span className="text-xs font-normal text-ink-mute">· {sharedDay.weight.length} entries</span></h4>{sharedDay.weight.length ? <div className="mt-3 space-y-2">{sharedDay.weight.map((entry) => <p key={entry.id} className="rounded-xl bg-sunken p-3 text-sm"><span className="font-medium">{entry.subjectName}</span> · {entry.weightKg} kg{entry.notes ? <span className="block pt-1 text-xs text-ink-mute">{entry.notes}</span> : null}</p>)}</div> : <p className="mt-3 text-sm text-ink-mute">No weight entries for this date.</p>}</section>
                </div>

                <section className="rounded-2xl border border-line bg-sunken p-4"><div className="flex flex-wrap items-center justify-between gap-3"><h4 className="font-semibold">Daily workouts <span className="text-xs font-normal text-ink-mute">· {sharedDay.workouts.length} sessions</span></h4></div>{sharedDay.workouts.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{sharedDay.workouts.map((workout) => <article key={workout.id} className="rounded-xl bg-sunken p-3"><p className="font-medium">{workout.subjectName || "Workspace member"} · {workout.workoutType}</p>{workout.exercises.map((exercise, index) => <p key={`${workout.id}-${index}`} className="mt-2 text-xs text-ink-soft">{exercise.name} · {exercise.sets} × {exercise.reps}{exercise.weightKg > 0 ? ` · ${exercise.weightKg} kg` : ""}</p>)}{workout.notes && <p className="mt-2 text-xs text-ink-mute">{workout.notes}</p>}</article>)}</div> : <p className="mt-3 rounded-xl border border-dashed border-line p-4 text-sm text-ink-soft">No partner workouts logged for this date.</p>}</section>
              </div>}
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                onClick={() => void loadWorkspace()}
                disabled={checking || loading}
                className="rounded-2xl border border-line px-4 py-3 text-sm text-ink-soft transition hover:bg-sunken disabled:opacity-50"
              >
                Refresh workspace
              </button>

              {members.length < 2 && (
                <button
                  onClick={() => void generateInviteCode()}
                  disabled={loading || checking}
                  className="rounded-2xl bg-butter px-4 py-3 text-sm font-bold text-butter-ink transition hover:bg-butter-hover disabled:opacity-50"
                >
                  {loading ? "Generating..." : "Generate invite code"}
                </button>
              )}
            </div>
          </section>
        ) : (
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            <section className="rounded-3xl border border-periwinkle/25 card p-6 sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-butter text-xl font-bold text-butter-ink">
                +
              </div>

              <h2 className="mt-5 text-xl font-bold">Create a workspace</h2>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Start your shared fitness space and create a private invite
                code for your partner.
              </p>

              <button
                onClick={() => void createWorkspace()}
                disabled={loading}
                className="mt-6 w-full rounded-2xl bg-butter px-4 py-3 text-sm font-bold text-butter-ink transition hover:bg-butter-hover disabled:opacity-50"
              >
                {loading ? "Please wait..." : "Create workspace"}
              </button>
            </section>

            <section className="rounded-3xl border border-line card p-6 sm:p-7">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sunken text-xl text-periwinkle">
                ↗
              </div>

              <h2 className="mt-5 text-xl font-bold">Join a workspace</h2>

              <p className="mt-2 text-sm leading-6 text-ink-soft">
                Enter the private code your partner shared with you.
              </p>

              <form onSubmit={joinWorkspace} className="mt-6 space-y-3">
                <label
                  htmlFor="inviteCode"
                  className="block text-xs font-medium text-ink-soft"
                >
                  Invite code
                </label>

                <input
                  id="inviteCode"
                  value={joinCode}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase())
                  }
                  placeholder="Enter 16-character code"
                  maxLength={16}
                  minLength={16}
                  pattern="[A-F0-9]{16}"
                  autoComplete="off"
                  required
                  className="w-full rounded-2xl border border-line bg-sunken px-4 py-3 font-mono text-sm tracking-widest text-ink outline-none placeholder:font-sans placeholder:tracking-normal placeholder:text-ink-mute focus:border-periwinkle/50"
                />

                <button
                  type="submit"
                  disabled={loading || joinCode.trim().length !== 16}
                  className="w-full rounded-2xl border border-line px-4 py-3 text-sm font-semibold text-ink transition hover:bg-sunken disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading ? "Please wait..." : "Join workspace"}
                </button>
              </form>
            </section>
          </div>
        )}

        <footer className="mt-10 border-t border-line pt-5 text-xs text-ink-mute">
          Signed in as {user.email}
        </footer>
      </div>
    </main>
  );
}

