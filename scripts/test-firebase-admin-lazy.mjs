import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

const moduleUrl = pathToFileURL(
  join(process.cwd(), "src/lib/server/firebase-admin.ts"),
).href;

function runIsolated(code) {
  const cwd = mkdtempSync(join(tmpdir(), "firebase-admin-lazy-"));
  const env = { ...process.env };
  delete env.FIREBASE_PROJECT_ID;
  delete env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  delete env.FIREBASE_CLIENT_EMAIL;
  delete env.FIREBASE_PRIVATE_KEY;

  try {
    return spawnSync(
      process.execPath,
      [
        "--experimental-strip-types",
        "--conditions=react-server",
        "--input-type=module",
        "-e",
        code,
      ],
      { cwd, env, encoding: "utf8" },
    );
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

test("Firebase Admin module imports without credentials", () => {
  const result = runIsolated(
    `await import(${JSON.stringify(moduleUrl)}); console.log("imported");`,
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /imported/);
});

test("Firebase Admin access fails without credentials", () => {
  const result = runIsolated(
    `const { adminDb } = await import(${JSON.stringify(moduleUrl)}); adminDb.collection("users");`,
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Missing FIREBASE_PROJECT_ID/);
});
