const MUSCLE_RULES: Array<[RegExp, string]> = [
  [/\b(chest|pectoral|pecs?)\b/i, "Chest"],
  [/\b(lat pulldown|pull[- ]?up|chin[- ]?up|pulldown|cable row|dumbbell row|barbell row|seated row|one[- ]arm row|t[- ]bar row)\b/i, "Back"],
  [/\b(deadlift|good morning|back extension|hyperextension)\b/i, "Back"],
  [/\b(overhead press|shoulder press|lateral raise|front raise|rear delt|face pull|deltoid)\b/i, "Shoulders"],
  [/\b(biceps?|bicep curl|hammer curl|preacher curl)\b/i, "Biceps"],
  [/\b(triceps?|tricep|pushdown|skull crusher|overhead extension)\b/i, "Triceps"],
  [/\b(quads?|quadriceps?|squat|lunge|leg press|step[- ]?up|leg extension)\b/i, "Quads"],
  [/\b(hamstrings?|leg curl|nordic curl)\b/i, "Hamstrings"],
  [/\b(glutes?|glute bridge|hip thrust|kickback|hip abduction)\b/i, "Glutes"],
  [/\b(calf|calves|calf raise)\b/i, "Calves"],
  [/\b(abs?|abdominal|crunch|sit[- ]?up|plank|oblique|core)\b/i, "Core"],
  [/\b(bench press|push[- ]?up|pushup|chest fly|chest press|pec deck)\b/i, "Chest"],
];

/** Resolve an exercise's saved muscle tag, falling back to a conservative name estimate. */
export function inferExerciseMuscle(name: string, muscle?: string | null): string | null {
  const tag = muscle?.trim();
  if (tag && !/^(full\s*body|uncategorized|unknown)$/i.test(tag)) return tag;

  for (const [pattern, group] of MUSCLE_RULES) {
    if (pattern.test(name)) return group;
  }
  return tag || null;
}
