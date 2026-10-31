import test from "node:test";
import assert from "node:assert/strict";
import { clampFiniteNumber, normalizeLabels, workoutIdempotencyDocumentId, fitnessRecordCanBeMutated, workspaceMembershipCanReadSharedData } from "../src/lib/server/request-policies.ts";
import { readBoundedJson, RequestBodyTooLarge } from "../src/lib/server/request-body.ts";
import { activeRateLimitCount, isWorkspaceInviteUsable, isWorkspaceInviteExpiredOrUsed } from "../src/lib/server/expiration.ts";

test("weekly metrics are clamped to finite configured ranges", () => {
  assert.equal(clampFiniteNumber(1e99, 1000), 1000);
  assert.equal(clampFiniteNumber(-20, 1000), 0);
  assert.equal(clampFiniteNumber("NaN", 1000), 0);
});

test("weekly labels are type checked and bounded", () => {
  assert.deepEqual(normalizeLabels(["  Chest  ", "x".repeat(60), { bad: true }], 2, 40), ["Chest", "x".repeat(40)]);
  assert.equal(normalizeLabels(Array.from({ length: 30 }, (_, i) => `M${i}`)).length, 20);
});

test("workout idempotency IDs are stable and scoped to the account", () => {
  const id = workoutIdempotencyDocumentId("member-a", "session_1234");
  assert.equal(id, workoutIdempotencyDocumentId("member-a", "session_1234"));
  assert.notEqual(id, workoutIdempotencyDocumentId("member-b", "session_1234"));
  assert.equal(id?.length, 40);
  assert.equal(workoutIdempotencyDocumentId("member-a", "bad key"), null);
});

test("bounded JSON rejects declared oversized bodies and accepts a body at its limit", async () => {
  const oversized = new Request("https://example.test", { method: "POST", headers: { "content-length": "21" }, body: "{}" });
  await assert.rejects(readBoundedJson(oversized, 20), RequestBodyTooLarge);
  const exact = new Request("https://example.test", { method: "POST", body: "12345" });
  assert.equal(await readBoundedJson(exact, 5), 12345);
});

test("workspace reads require an active membership and an active workspace", () => {
  assert.equal(workspaceMembershipCanReadSharedData({ workspaceId: "ws-a", status: "active" }, { status: "active" }), true);
  assert.equal(workspaceMembershipCanReadSharedData(undefined, { status: "active" }), false);
  assert.equal(workspaceMembershipCanReadSharedData({ workspaceId: "ws-a", status: "leaving" }, { status: "active" }), false);
  assert.equal(workspaceMembershipCanReadSharedData({ workspaceId: "ws-a", status: "active" }, { status: "deleting" }), false);
});

test("only each record owner may mutate workspace fitness records", () => {
  assert.equal(fitnessRecordCanBeMutated("water", "a", { loggedBy: "a" }), true);
  assert.equal(fitnessRecordCanBeMutated("water", "a", { loggedBy: "b" }), false);
  assert.equal(fitnessRecordCanBeMutated("weight", "a", { subjectUid: "b" }), false);
  assert.equal(fitnessRecordCanBeMutated("weight", "a", { subjectUid: "a" }), true);
  assert.equal(fitnessRecordCanBeMutated("workouts", "a", { loggedBy: "b" }), false);
  assert.equal(fitnessRecordCanBeMutated("workouts", "a", { loggedBy: "a" }), true);
});


test("bounded JSON rejects oversized streamed bodies even without a length header", async () => {
  const request = new Request("https://example.test", { method: "POST", body: JSON.stringify({ text: "x".repeat(50) }) });
  await assert.rejects(readBoundedJson(request, 20), RequestBodyTooLarge);
});

test("rate limits count only records with an active window and retention", () => {
  const now = 10_000_000;
  assert.equal(activeRateLimitCount({ windowStartedAtMs: now - 1000, expiresAtMs: now + 1000, count: 4 }, now, 60_000), 4);
  assert.equal(activeRateLimitCount({ windowStartedAtMs: now - 60_000, expiresAtMs: now + 1000, count: 4 }, now, 60_000), 0);
  assert.equal(activeRateLimitCount({ windowStartedAtMs: now - 1000, expiresAtMs: now, count: 4 }, now, 60_000), 0);
  assert.equal(activeRateLimitCount({ windowStartedAtMs: now - 1000, count: 4 }, now, 60_000), 4);
});

test("workspace invites can be redeemed once only before expiry", () => {
  const now = 10_000_000;
  assert.equal(isWorkspaceInviteUsable(now + 1000, 0, 1, now), true);
  assert.equal(isWorkspaceInviteUsable(now, 0, 1, now), false);
  assert.equal(isWorkspaceInviteUsable(now + 1000, 1, 1, now), false);
  assert.equal(isWorkspaceInviteExpiredOrUsed(now + 1000, 1, 1, now), true);
  assert.equal(isWorkspaceInviteUsable(undefined, 0, 1, now), false);
});
