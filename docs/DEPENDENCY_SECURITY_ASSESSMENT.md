# KAIRO production dependency security assessment

**Reviewed:** 31 Oct 2026

**Scope:** `npm audit --omit=dev`, lockfile dependency paths, installed package entry points, and KAIRO server imports. Read-only assessment: no package manifest/lockfile edits, package installs, upgrades, overrides, or removals were made for this review.

## Executive assessment

The current production audit returns **six moderate package findings, zero high/critical findings**. These are six npm package entries but only **two distinct underlying GitHub advisories**:

- [GHSA-3g3m-2fjr-6pw4 / CVE-2026-118773](https://github.com/advisories/GHSA-3g3m-2fjr-6pw4): glob keeps walking directories after cancellation. The published fix is `glob@14.0.2`.
- [GHSA-g3hv-75wg-m249 / CVE-2026-118764](https://github.com/advisories/GHSA-g3hv-75wg-m249): attacker-controlled minimatch patterns can amplify work quadratically. The published fix is `minimatch@11.0.1`.

`rimraf`, `gaxios`, `gcp-metadata`, and `google-gax` are included in npm's six-entry count because their dependency chains include one or both vulnerable filesystem/pattern packages. They do not have four additional independent advisories in this audit report.

**Reachability judgment:** Firebase Admin Firestore and Google Auth code are used by the server. The vulnerable glob-pattern operations are not called by KAIRO source: there is no application import/use of `glob` or `rimraf`, no endpoint that accepts a file glob, and no attacker-controlled glob pattern or `AbortSignal` passed to those APIs. The affected packages are present in the production install graph, but the advisory-specific functions are not shown to be reachable through KAIRO request handling. This is a source/dependency review, not a production runtime trace or penetration test.

**Deployment judgment:** These advisories do **not by themselves demonstrate an exploitable production path in KAIRO**, so they are not an inherent technical deployment blocker on current evidence. `npm audit --omit=dev` still exits nonzero. A policy requiring a clean audit would block deployment; the repository's CI threshold (`--audit-level=high`) does not fail on these moderates and prints them. Keep the exception explicit and revisit it when the upstream Firebase/Google dependency chain moves to patched versions.

## Dependency paths and findings

The common production path is:

```text
fitness-ai-firebase
└─ firebase-admin@14.5.0
   └─ @google-cloud/firestore@9.3.1 (optional dependency, installed)
      └─ @google-cloud/firestore-api@0.2.0
         └─ google-gax@5.0.8
```

The nested chain reported by `npm explain` continues as:

```text
google-gax@5.0.8
└─ google-auth-library@10.5.0
   └─ gcp-metadata@8.1.4
      └─ gaxios@7.1.3
         └─ rimraf@5.0.10
            └─ glob@10.5.0
               └─ minimatch@9.0.9
```

Some edges are repeated: `google-gax` and `gcp-metadata` both reach `rimraf`; `gcp-metadata` pins `gaxios@7.1.3`, while Google Auth also has its own `gaxios` range. `npm explain glob` and `npm explain minimatch` show the relevant production instances as optional/transitive packages; dev-only `minimatch` copies are omitted from this production assessment.

| Package and installed production version | Advisory and affected range | Dependency path (`npm explain`) | Reachability and component | Recommendation | Blocks production on current evidence? |
|---|---|---|---|---|---|
| **glob 10.5.0** (`node_modules/glob`, optional) | GHSA-3g3m-2fjr-6pw4 / CVE-2026-118773; `>=9.0.0 <=14.0.1`. It also brings in the affected minimatch below. | `firebase-admin@14.5.0` → `@google-cloud/firestore@9.3.1` → `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` → `gcp-metadata@8.1.4` → `gaxios@7.1.3` → `rimraf@5.0.10` → `glob@10.5.0`. | **Not shown reachable at the vulnerable call site.** `glob` is imported by rimraf, but KAIRO has no glob/rimraf calls or user-controlled patterns. This is a filesystem availability issue, not Firebase data access or auth bypass. | **MITIGATE.** Do not expose glob patterns or add calls to glob/rimraf; update the chain when upstream supports the patched range. An override to glob 14 would cross the current `rimraf@5` `glob@^10` dependency contract and needs compatibility testing. | **No.** On current source evidence, its cancellation precondition is not exposed. |
| **minimatch 9.0.9** (`node_modules/glob/node_modules/minimatch`, optional) | GHSA-g3hv-75wg-m249 / CVE-2026-118764; `<11.0.1`. | Same path through `rimraf@5.0.10` → `glob@10.5.0` → `minimatch@9.0.9`. | **Not shown reachable with attacker-controlled input.** It is glob's pattern parser, but KAIRO does not accept or construct user-controlled filesystem glob patterns. The impact is CPU/memory availability only; no data confidentiality/integrity effect was identified. | **MITIGATE.** Keep patterns out of request processing and move to a patched parent chain when available. `minimatch@11.0.1` is outside glob 10's declared `^9.0.4` range; forcing it is a cross-major override. | **No.** The vulnerable pattern input is not exposed by KAIRO. |
| **rimraf 5.0.10** (`node_modules/rimraf`, optional) | Inherited GHSA-3g3m-2fjr-6pw4 via glob and GHSA-g3hv-75wg-m249 via minimatch; npm range shown as `>=4.2.0` because vulnerable glob is underneath. | `firebase-admin` → Firestore → Firestore API → `google-gax@5.0.8` → `rimraf@5.0.10` → `glob@10.5.0` → `minimatch@9.0.9`; also reached through `google-gax` → Google Auth → `gcp-metadata` → `gaxios` → rimraf. | **Dependency present; no KAIRO call site found.** rimraf's own entry point imports glob for its optional glob mode, but KAIRO does not call rimraf. It affects a filesystem utility dependency, not Firestore record deletion or account deletion code. | **ACCEPT WITH DOCUMENTED REASON.** The package is present transitively but no application path invokes its vulnerable glob mode. `rimraf@6` is a major upgrade and its declared glob range is `^11`, which still does not include patched glob 14; upgrading rimraf alone would not clear both advisories. | **No.** Inherited entry, with no app invocation found. |
| **gaxios 7.1.3** (`node_modules/@google-cloud/firestore-api/node_modules/gaxios`, optional) | Inherited through `rimraf` → glob/minimatch. npm marks this package affected by rimraf; this is not a separate Gaxios CVE in the current audit. | `firebase-admin` → Firestore → Firestore API → `google-gax@5.0.8` → Google Auth → `gcp-metadata@8.1.4` → `gaxios@7.1.3` → `rimraf@5.0.10` → glob/minimatch. | **Gaxios itself is used by Google Auth/metadata request code**, so the HTTP client is part of a conditional credential/API path. However, the advisory-relevant rimraf/glob code is not imported by Gaxios's shipped request implementation and is not driven by HTTP request data here. It is not an authentication bypass. | **MITIGATE.** A same-major `gaxios@7.3.1` exists and its published dependency list no longer includes rimraf, but this parent chain's `gcp-metadata@8.1.4` pins `gaxios` exactly to `7.1.3`. A targeted override would violate that exact upstream pin; test Firestore/Auth before using one. | **No.** The vulnerable filesystem behavior is inherited and not part of Gaxios's request path here. |
| **gcp-metadata 8.1.4** (`node_modules/@google-cloud/firestore-api/node_modules/gcp-metadata`, optional) | Inherited through its pinned Gaxios version → rimraf → glob/minimatch. npm's affected range is `8.1.3–8.1.4`; the audit does not identify a separate gcp-metadata CVE. | `firebase-admin` → Firestore → Firestore API → `google-gax@5.0.8` → `google-auth-library@10.5.0` → `gcp-metadata@8.1.4` → `gaxios@7.1.3` → rimraf/glob/minimatch. | **Conditionally reachable for Google Cloud metadata discovery.** KAIRO initializes Firebase Admin with explicit `cert()` service-account credentials from environment variables (or the local service-account file); ordinary production operation should not need metadata-server credential discovery. This is not Firebase user token verification. | **ACCEPT WITH DOCUMENTED REASON.** No patched 8.x `gcp-metadata` version was found in registry metadata; v9 changes major and pairs with Google Auth 11.3+. Moving the parent Google Auth/GAX/Firestore API chain is materially broader than a safe patch. The inherited vulnerable filesystem path is not the metadata request itself. | **No.** Normal configured credentials do not rely on this fallback; inherited path is not shown reachable. |
| **google-gax 5.0.8** (`node_modules/@google-cloud/firestore-api/node_modules/google-gax`, optional) | Inherited through `rimraf` → glob/minimatch; npm affected range `5.0.5–5.0.8`. No separate google-gax advisory is shown by this audit. | `firebase-admin` → `@google-cloud/firestore@9.3.1` → `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` → rimraf → glob/minimatch. | **Google-gax is used by the Firestore API client**, so Firestore server operations are active. The issue is inherited from its rimraf dependency; no google-gax source call to rimraf/glob was found. This does not expose Firestore data or change authorization. | **ACCEPT WITH DOCUMENTED REASON.** A stable `google-gax@6.x` and `@google-cloud/firestore-api@0.7.1` are available, but the installed Firestore API package declares `google-gax@^5.0.0`, while Firestore 9.3.1 declares API `^0.2.0`. Replacing either edge crosses declared version ranges and needs a coordinated Firestore compatibility update and integration tests. | **No.** Firestore is active, but the vulnerable rimraf/glob code is not called by its client path. |

## Fix compatibility and risk summary

The registry versions reviewed show these candidate fixes:

- `glob@14.0.2` (patched) depends on `minimatch@^11.0.0`; the exact fixed minimatch floor is 11.0.1. The current `rimraf@5.0.10` requests `glob@^10.3.7` and cannot consume glob 14 by normal semver resolution.
- `rimraf@6.0.1` requests glob `^11.0.0`, so it is not by itself a fix for the glob advisory, whose patched version starts at 14.0.2. Moving rimraf 5→6 is also a major update.
- `gaxios@7.3.1` remains on major 7 and no longer lists rimraf in its published dependencies; however, `gcp-metadata@8.1.4` pins 7.1.3 exactly. A focused override is technically possible but unvalidated against this pinned parent.
- `gcp-metadata@9.x` and `google-auth-library@11.x` form a newer chain, but they cross current parent ranges (`gcp-metadata@^8` in Google Auth 10). This is a coordinated major-chain change, not a narrow patch.
- `google-gax@6.x` and Firestore API 0.7.x are available, but current declared ranges are `google-gax@^5` and `@google-cloud/firestore-api@^0.2.0`. Moving the generated Firestore client stack can affect RPC/auth behavior and should be tested against Firebase Admin Firestore operations.

`npm audit` reports `fixAvailable: true` for these entries, but that flag does not establish that the remedy is semver-compatible with the locked parent chain. The non-force audit-fix attempt did not remove the six moderate findings. Do not apply a force upgrade or blanket override based only on that flag.

## Production decision

**Current call: the advisories do not independently block deployment based on source reachability, but they remain unresolved supply-chain findings.** The specific GHSA exploit preconditions are not exposed by KAIRO's routes, and the impacted effect is availability. This conclusion does not supersede a stricter organizational rule requiring `npm audit --omit=dev` to be clean. Current CI uses `--audit-level=high`, so it reports these moderate findings without failing; CI success is not equivalent to a clean audit.

Reassess when Firebase Admin/Google publishes a compatible dependency update. If a targeted override is considered before then, run clean-install, build, Firestore read/write/transaction, auth credential, and metadata-fallback checks before accepting it. No two-account staging, deployed environment, or Firebase/Google console was inspected for this dependency-only assessment.
