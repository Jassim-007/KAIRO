import assert from "node:assert/strict";
import fs from "node:fs";
import Module from "node:module";
import path from "node:path";
import { test } from "node:test";
import ts from "typescript";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const policyPath = path.resolve(__dirname, "../src/lib/server/account-deletion-policy.ts");
const source = fs.readFileSync(policyPath, "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const policyModule = new Module(policyPath);
policyModule.filename = policyPath;
policyModule.paths = Module._nodeModulePaths(path.dirname(policyPath));
policyModule._compile(compiled, policyPath);
const { activeWorkspaceMemberCount, isDeletionInProgress, isWorkspaceOwner, memberOwnsRecord, resolveDeletionScope, workspaceLifecycleDecision } = policyModule.exports;

const cleanupPath = path.resolve(__dirname, "../src/lib/server/delete-query-in-pages.ts");
const cleanupSource = fs.readFileSync(cleanupPath, "utf8");
const cleanupCompiled = ts.transpileModule(cleanupSource, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const cleanupModule = new Module(cleanupPath);
cleanupModule.filename = cleanupPath;
cleanupModule.paths = Module._nodeModulePaths(path.dirname(cleanupPath));
cleanupModule._compile(cleanupCompiled, cleanupPath);
const { deleteQueryInPages } = cleanupModule.exports;

test("solo deletion is scoped to the user's own private storage", () => {
  assert.deepEqual(resolveDeletionScope({ ownerUid: "solo-1", deletionType: "solo", status: "deleting" }, "solo-1"), {
    type: "solo",
    workspaceId: null,
  });
});

test("owner deletion retains the workspace scope, including legacy owner jobs", () => {
  assert.deepEqual(resolveDeletionScope({ ownerUid: "owner-1", deletionType: "owner", workspaceId: "workspace-1", status: "deleting" }, "owner-1"), {
    type: "owner",
    workspaceId: "workspace-1",
  });
  assert.deepEqual(resolveDeletionScope({ ownerUid: "owner-1", workspaceId: "workspace-1", status: "deleting" }, "owner-1"), {
    type: "owner",
    workspaceId: "workspace-1",
  });
});

test("member deletion retains the shared workspace ID but is not owner-scoped", () => {
  assert.deepEqual(resolveDeletionScope({ ownerUid: "member-1", deletionType: "member", workspaceId: "workspace-1", status: "deleting" }, "member-1"), {
    type: "member",
    workspaceId: "workspace-1",
  });
});

test("invalid or cross-account jobs cannot select a deletion scope", () => {
  assert.equal(resolveDeletionScope({ ownerUid: "someone-else", deletionType: "solo", status: "deleting" }, "solo-1"), null);
  assert.equal(resolveDeletionScope({ ownerUid: "solo-1", deletionType: "member", status: "deleting" }, "solo-1"), null);
  assert.equal(resolveDeletionScope({ ownerUid: "solo-1", deletionType: "solo", status: "complete" }, "solo-1"), null);
});

test("only a valid active job blocks normal API access; stale jobs do not", () => {
  assert.equal(isDeletionInProgress({ ownerUid: "user-1", deletionType: "solo", status: "deleting" }, "user-1"), true);
  assert.equal(isDeletionInProgress({ ownerUid: "user-1", deletionType: "solo", status: "failed" }, "user-1"), false);
  assert.equal(isDeletionInProgress({ ownerUid: "other-user", deletionType: "solo", status: "deleting" }, "user-1"), false);
});

test("member record cleanup matches only that member's own records", () => {
  assert.equal(memberOwnsRecord("nutrition", { loggedBy: "member-1" }, "member-1"), true);
  assert.equal(memberOwnsRecord("nutrition", { loggedBy: "owner-1" }, "member-1"), false);
  assert.equal(memberOwnsRecord("water", { loggedBy: "member-1" }, "member-1"), true);
  assert.equal(memberOwnsRecord("weight", { subjectUid: "member-1", loggedBy: "owner-1" }, "member-1"), true);
  assert.equal(memberOwnsRecord("weight", { subjectUid: "owner-1", loggedBy: "member-1" }, "member-1"), false);
  assert.equal(memberOwnsRecord("workouts", { subjectUid: "member-1", loggedBy: "owner-1" }, "member-1"), true);
  assert.equal(memberOwnsRecord("workouts", { subjectUid: "owner-1", loggedBy: "member-1" }, "member-1"), true);
  assert.equal(memberOwnsRecord("workouts", { subjectUid: "owner-1", loggedBy: "owner-1" }, "member-1"), false);
});

test("workspace capacity counts active memberships and ignores deleting or leaving memberships", () => {
  assert.equal(activeWorkspaceMemberCount([{ role: "owner" }, { role: "member", status: "deleting" }]), 1);
  assert.equal(activeWorkspaceMemberCount([{ role: "owner" }, { role: "member", status: "leaving" }]), 1);
  assert.equal(activeWorkspaceMemberCount([{ role: "owner" }, { role: "member" }]), 2);
});

test("only the verified creator with owner role has workspace owner controls", () => {
  assert.equal(isWorkspaceOwner({ role: "owner" }, "a", "a"), true);
  assert.equal(isWorkspaceOwner({ role: "member" }, "b", "b"), false);
  assert.equal(isWorkspaceOwner({ role: "owner" }, "a", "b"), false);
});

test("workspace lifecycle policy preserves personal data and scopes leave and delete", () => {
  assert.deepEqual(workspaceLifecycleDecision("leave", "member"), { allowed: true, removeWorkspace: false, removeMemberRecords: true, preservePersonalData: true });
  assert.deepEqual(workspaceLifecycleDecision("leave", "owner"), { allowed: false, removeWorkspace: false, removeMemberRecords: false, preservePersonalData: true });
  assert.deepEqual(workspaceLifecycleDecision("delete", "owner"), { allowed: true, removeWorkspace: true, removeMemberRecords: false, preservePersonalData: true });
  assert.deepEqual(workspaceLifecycleDecision("delete", "member"), { allowed: false, removeWorkspace: false, removeMemberRecords: false, preservePersonalData: true });
});

test("query cleanup commits bounded pages and resumes after the last document", async () => {
  const documents = Array.from({ length: 5 }, (_, id) => ({ id, ref: `doc-${id}` }));
  const queries = [];
  const committed = [];
  const pageSizes = [];
  const query = {
    orderBy(field) { assert.equal(field, "documentId"); return this; },
    limit(size) { pageSizes.push(size); this.pageSize = size; return this; },
    startAfter(cursor) { this.cursor = cursor; return this; },
    async get() {
      queries.push(this.cursor?.id ?? null);
      const start = this.cursor ? this.cursor.id + 1 : 0;
      const docs = documents.slice(start, start + this.pageSize);
      this.cursor = undefined;
      return { docs, empty: docs.length === 0 };
    },
  };

  const deleted = await deleteQueryInPages({
    query,
    documentIdField: "documentId",
    pageSize: 2,
    createBatch() {
      const refs = [];
      return {
        delete(ref) { refs.push(ref); return this; },
        async commit() { committed.push([...refs]); },
      };
    },
  });

  assert.equal(deleted, documents.length);
  assert.deepEqual(queries, [null, 1, 3, 4]);
  assert.deepEqual(committed, [["doc-0", "doc-1"], ["doc-2", "doc-3"], ["doc-4"]]);
  assert.ok(pageSizes.every((size) => size === 2));
});
