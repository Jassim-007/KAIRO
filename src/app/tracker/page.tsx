"use client";

import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import NaturalLog from "@/app/components/natural-log";

type RecordItem = {
  id: string; date: string; foodName?: string; mealType?: string; servings?: number; calories?: number;
  protein?: number; carbs?: number; fat?: number; amountMl?: number; workoutType?: string;
  weightKg?: number; notes?: string; loggedBy?: string;
  exercises?: { name: string; sets: number; reps: number; weightKg: number }[];
};
type Summary = {
  userTotals: { calories: number; protein: number; carbs: number; fat: number; waterMl: number; workouts: number };
  currentWeight: number | null; weightHistory: { id: string; date: string; weightKg: number }[];
  goals: { waterMl?: number | null } | null;
};
const today = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};

export default function TrackerPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [foods, setFoods] = useState<RecordItem[]>([]);
  const [water, setWater] = useState<RecordItem[]>([]);
  const [workouts, setWorkouts] = useState<RecordItem[]>([]);
  const [error, setError] = useState("");
  const [selectedDate,setSelectedDate]=useState(today()); const [editing,setEditing]=useState<RecordItem|null>(null); const [saving,setSaving]=useState(false);

  useEffect(() => onAuthStateChanged(auth, (current) => {
    setUser(current);
    if (!current) router.replace("/login");
  }), [router]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const request = async (path: string) => {
        const response = await fetch(path, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Could not load your tracker.");
        return data;
      };
      const date = selectedDate;
      const [progress, nutrition, waterLog, workoutLog] = await Promise.all([
        request(`/api/progress?date=${date}`), request(`/api/nutrition?date=${date}`),
        request(`/api/fitness/water?date=${date}`), request(`/api/fitness/workouts?date=${date}`),
      ]);
      setSummary(progress); setFoods(nutrition.records || []); setWater(waterLog.records || []);
      setWorkouts(workoutLog.records || []); setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load your tracker.");
    }
  }, [user,selectedDate]);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  useEffect(() => {
    const refresh = () => void load();
    window.addEventListener("fitness-record-saved", refresh);
    return () => window.removeEventListener("fitness-record-saved", refresh);
  }, [load]);

  if (!user) return <main className="min-h-screen" />;
  const totals = summary?.userTotals;
  const groups = [
    { title: "Today’s food", items: foods, empty: "No meals logged yet." },
    { title: "Water", items: water, empty: "No water logged yet." },
    { title: "Workouts", items: workouts, empty: "No workout recorded today." },
  ];

  return (
    <main className="min-h-screen text-ink">
      <header className="px-4 pb-3 pt-[max(1rem,env(safe-area-inset-top))] sm:px-8"><p className="text-xs text-ink-mute">FORM/AI · your fitness space</p></header>
      
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:space-y-8 sm:px-8 sm:py-8">
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-periwinkle">Your personal log</p>
          <h1 className="mt-2 text-3xl font-bold">Tracker</h1>
          <p className="mt-2 text-sm text-ink-soft">Review and update your training, meals, hydration, and progress by day.</p>
        </section>
        <label className="block max-w-xs text-sm text-ink-soft">Log date<input type="date" value={selectedDate} max={today()} onChange={e=>setSelectedDate(e.target.value)} className="mt-2 w-full px-3 py-3"/></label>
        {error && <p role="alert" className="rounded-2xl border border-warn/30 p-3 text-sm text-warn">{error}</p>}
        <NaturalLog inline />
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {[
            { label: "Calories", value: Math.round(totals?.calories ?? 0), unit: "kcal" },
            { label: "Protein", value: Math.round(totals?.protein ?? 0), unit: "g" },
            { label: "Carbs · Fat", value: `${Math.round(totals?.carbs ?? 0)} · ${Math.round(totals?.fat ?? 0)}`, unit: "g" },
            { label: "Water", value: ((totals?.waterMl ?? 0) / 1000).toFixed(1), unit: `L${summary?.goals?.waterMl ? ` / ${(summary.goals.waterMl / 1000).toFixed(1)} goal` : ""}` },
            { label: "Latest weight", value: summary?.currentWeight ?? "—", unit: "kg" },
          ].map((item) => (
            <article key={item.label} className="rounded-3xl border border-line card p-4">
              <p className="text-xs text-ink-mute">{item.label}</p>
              <p className="mt-2 text-2xl font-semibold">{item.value} <span className="text-xs font-normal text-ink-mute">{item.unit}</span></p>
            </article>
          ))}
        </section>
        <section className="grid gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <article key={group.title} className="rounded-3xl border border-line card p-5">
              <div className="flex justify-between"><h2 className="font-semibold">{group.title}</h2><span className="text-xs text-ink-mute">{group.items.length} entries</span></div>
              {group.items.length === 0 ? <p className="mt-4 text-sm text-ink-mute">{group.empty}</p> : (
                <div className="mt-3 space-y-2">
                  {group.items.map((item) => (
                    <div key={item.id} className="rounded-2xl bg-field px-3 py-3 text-sm">
                      <div className="flex items-start justify-between gap-3"><p className="font-medium">{item.foodName || (item.amountMl ? `${item.amountMl} ml water` : `${item.workoutType} workout`)}</p>{(item.foodName||item.amountMl||item.loggedBy===user.uid)&&<button onClick={()=>setEditing(item)} className="rounded-xl border border-line px-3 py-1 text-xs text-periwinkle hover:border-periwinkle/50">Edit</button>}</div>
                      {item.foodName && <p className="mt-1 text-xs text-ink-mute">{item.mealType} · {Math.round(item.calories ?? 0)} kcal · {Math.round(item.protein ?? 0)} g protein · C {Math.round(item.carbs ?? 0)} g · F {Math.round(item.fat ?? 0)} g</p>}
                      {item.exercises?.map((exercise, index) => <p key={index} className="mt-1 text-xs text-ink-soft">{exercise.name}: {exercise.sets} × {exercise.reps}{exercise.weightKg ? ` · ${exercise.weightKg} kg` : ""}</p>)}
                    </div>
                  ))}
                </div>
              )}
            </article>
          ))}
          <article className="rounded-3xl border border-line card p-5">
            <h2 className="font-semibold">Recent weigh-ins</h2>
            {summary?.weightHistory.length ? <div className="mt-3 space-y-2">{summary.weightHistory.filter(item=>item.date===selectedDate).map((item) => <div key={item.id} className="flex justify-between rounded-2xl bg-field px-3 py-3 text-sm"><span className="text-ink-mute">{item.date}</span><span>{item.weightKg} kg</span><button onClick={()=>setEditing({id:item.id,date:item.date,weightKg:item.weightKg})} className="text-xs text-periwinkle">Edit</button></div>)}</div> : <p className="mt-3 text-sm text-ink-mute">No weight entries for this day. Tell the chat your current weight.</p>}
          </article>
        </section>
      </div>{editing&&<EditEntry item={editing} user={user} saving={saving} onClose={()=>setEditing(null)} onSaving={setSaving} onSaved={()=>{setEditing(null);void load()}} onError={setError}/>}
    </main>
  );
}

function EditEntry({item,user,saving,onClose,onSaving,onSaved,onError}:{item:RecordItem;user:User;saving:boolean;onClose:()=>void;onSaving:(value:boolean)=>void;onSaved:()=>void;onError:(value:string)=>void}) {
  const [draft,setDraft]=useState({date:item.date,name:item.foodName||"",mealType:item.mealType||"Snack",servings:String(item.servings??1),calories:String(item.calories??0),protein:String(item.protein??0),carbs:String(item.carbs??0),fat:String(item.fat??0),amountMl:String(item.amountMl??0),weightKg:String(item.weightKg??0),workoutType:item.workoutType||"Custom",notes:item.notes||""});
  const kind=item.foodName?"nutrition":item.amountMl?"water":item.weightKg?"weight":"workouts";
  async function save(event:React.FormEvent){event.preventDefault();onSaving(true);onError("");try{const token=await user.getIdToken();const body=kind==="nutrition"?{foodName:draft.name,mealType:draft.mealType,servings:Number(draft.servings),calories:Number(draft.calories),protein:Number(draft.protein),carbs:Number(draft.carbs),fat:Number(draft.fat),date:draft.date,notes:draft.notes}:kind==="water"?{date:draft.date,amountMl:Number(draft.amountMl),notes:draft.notes}:kind==="weight"?{date:draft.date,weightKg:Number(draft.weightKg),notes:draft.notes}:{date:draft.date,workoutType:draft.workoutType,notes:draft.notes,exercises:item.exercises||[]};const path=kind==="nutrition"?`/api/nutrition/${item.id}`:`/api/fitness/${kind}/${item.id}`;const response=await fetch(path,{method:"PATCH",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:JSON.stringify(body)});const result=await response.json();if(!response.ok)throw new Error(result.error||"Could not update this entry.");onSaved()}catch(reason){onError(reason instanceof Error?reason.message:"Could not update this entry.")}finally{onSaving(false)}}
  const input=(key:keyof typeof draft,label:string,type="text")=><label className="block text-sm text-ink-soft">{label}<input required type={type} value={draft[key]} onChange={e=>setDraft(current=>({...current,[key]:e.target.value}))} className="mt-2 w-full px-3 py-2.5"/></label>;
  return <div className="fixed inset-0 z-[70] flex items-end justify-center bg-scrim backdrop-blur-sm sm:items-center sm:p-4"><form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="edit-entry-title" className="card sheet-in max-h-[90dvh] w-full max-w-xl space-y-4 overflow-y-auto rounded-t-[2rem] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-[2rem] sm:p-6" style={{backgroundColor:"var(--c-surface-solid)"}}><div className="flex items-start justify-between"><div><p className="text-xs font-semibold uppercase tracking-widest text-periwinkle">Personal log</p><h2 id="edit-entry-title" className="mt-1 text-xl font-bold">Edit {kind} entry</h2></div><button type="button" aria-label="Close editor" onClick={onClose} className="rounded-xl px-3 py-1 text-ink-soft hover:bg-lavender/55">×</button></div><div className="grid gap-3 sm:grid-cols-2">{input("date","Log date","date")}{kind==="nutrition"&&<>{input("name","Food or drink")}{<label className="block text-sm text-ink-soft">Meal<select value={draft.mealType} onChange={e=>setDraft({...draft,mealType:e.target.value})} className="mt-2 w-full px-3 py-2.5">{["Breakfast","Lunch","Dinner","Snack","Pre-workout","Post-workout"].map(v=><option key={v}>{v}</option>)}</select></label>}{input("servings","Servings","number")}{input("calories","Calories · kcal","number")}{input("protein","Protein · g","number")}{input("carbs","Carbs · g","number")}{input("fat","Fat · g","number")}</>}{kind==="water"&&input("amountMl","Water · ml","number")}{kind==="weight"&&input("weightKg","Weight · kg","number")}{kind==="workouts"&&<label className="block text-sm text-ink-soft">Workout type<select value={draft.workoutType} onChange={e=>setDraft({...draft,workoutType:e.target.value})} className="mt-2 w-full px-3 py-2.5">{["Push","Pull","Legs","Custom"].map(v=><option key={v}>{v}</option>)}</select></label>}</div><label className="block text-sm text-ink-soft">Notes<textarea rows={3} maxLength={500} value={draft.notes} onChange={e=>setDraft({...draft,notes:e.target.value})} className="mt-2 w-full px-3 py-2.5"/></label>{kind==="workouts"&&<p className="text-xs text-ink-mute">Exercise list is preserved while you update the session date, type, and notes.</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onClose} className="rounded-2xl border border-line-strong px-4 py-2.5 text-sm">Cancel</button><button disabled={saving} className="rounded-2xl bg-butter px-5 py-2.5 text-sm font-bold text-butter-ink disabled:opacity-50">{saving?"Saving…":"Save changes"}</button></div></form></div>;
}
