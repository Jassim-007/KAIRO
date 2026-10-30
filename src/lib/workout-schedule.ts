export type ScheduleRoutine = { id: string };
export type WorkoutStatus = "Scheduled" | "In progress" | "Completed" | "Not scheduled";

/** A saved date override, including an empty array, always takes precedence over the recurring weekday template. */
export function resolveDateRoutines<T extends ScheduleRoutine>(
  dateRoutines: T[] | null | undefined,
  weeklyRoutines: T[],
): T[] {
  return dateRoutines ?? weeklyRoutines;
}

export function workoutStatus(input: {
  scheduled: boolean;
  inProgress?: boolean;
  completed?: boolean;
}): WorkoutStatus {
  if (input.completed) return "Completed";
  if (input.inProgress) return "In progress";
  return input.scheduled ? "Scheduled" : "Not scheduled";
}
