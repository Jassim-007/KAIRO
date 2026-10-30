import assert from "node:assert/strict";
import test from "node:test";
import { resolveDateRoutines, workoutStatus } from "../src/lib/workout-schedule.ts";

test("date overrides take precedence over recurring weekday routines", () => {
  const weekly = [{ id: "legs" }, { id: "upper" }];
  assert.deepEqual(resolveDateRoutines([{ id: "upper" }], weekly), [{ id: "upper" }]);
  assert.deepEqual(resolveDateRoutines([], weekly), []);
  assert.deepEqual(resolveDateRoutines(null, weekly), weekly);
});

test("workout status distinguishes completed, active, planned, and unscheduled", () => {
  assert.equal(workoutStatus({ scheduled: true }), "Scheduled");
  assert.equal(workoutStatus({ scheduled: true, inProgress: true }), "In progress");
  assert.equal(workoutStatus({ scheduled: true, inProgress: true, completed: true }), "Completed");
  assert.equal(workoutStatus({ scheduled: false }), "Not scheduled");
});
