# Security operations follow-up

## Firebase and Google Cloud console

These project-level controls cannot be configured from this repository and must be reviewed in the production projects:

- Firebase Authentication: enable email-enumeration protection, review authorized domains, and set a suitable password policy.
- Firebase App Check: evaluate enforcement for the Firebase APIs used by the app. Firestore client access is denied by rules; App Check does not replace API authentication or the route ownership checks.
- Google AI Studio / Google Cloud: confirm Gemini API key restrictions, set budget notifications and applicable API quotas. Budget notifications are alerts, not a hard spend cap. Review actual billing controls for the project.
- Vercel: scope Firebase Admin and Gemini environment variables to Production/Preview/Development deliberately, review production deployment protection and function duration limits, and inspect CSP report-only violations before considering enforcement.
- Live checks: verify Firestore composite indexes, run a two-account workspace privacy test, review backups and rehearse restore in staging, and test AI-estimated nutrition confirmation on a device.

## Spark-compatible expiration and cleanup

Do not enable Firestore TTL for this Spark-plan deployment. Rate-limit checks treat a record as inactive after its request window or `expiresAt`, then overwrite it when that user/action is next used. Invitation redemption checks expiry inside the Firestore transaction and deletes an expired or consumed invitation when its code is presented. Creating a replacement invite also removes expired/consumed invitations for that workspace.

This is lazy cleanup: Firestore has no background cleanup on this plan, so an expired invite for an inactive workspace and a rate-limit document for an inactive account may remain stored until related activity or account deletion occurs. Expiry is still enforced at request time. No fitness, nutrition, progress, or account records are removed by this cleanup.

## Production dependency audit follow-up (31 Oct 2026)

The compatible lockfile refresh removed the high `re2js` advisory by resolving `re2js` 2.9.1 under Firebase's existing `^2.8.3` range. The remaining production audit reports six moderate advisories along this optional Firebase Admin Firestore API path:

`firebase-admin@14.5.0` → `@google-cloud/firestore@9.3.1` → `@google-cloud/firestore-api@0.2.0` → `google-gax@5.0.8` → `rimraf@5.0.10` → `glob@10.x` → vulnerable `minimatch`;
and the same `firestore-api@0.2.0` path pins `gaxios@7.1.3` → `gcp-metadata@8.1.4`.

The published safe glob fix is `glob@14.0.2`, which requires `minimatch@^11`; the installed `rimraf@5` chain requests `glob@^10`, and the current `firestore-api@0.2.0` package has no newer compatible release in its `^0.2.0` range. Forcing cross-major overrides to glob/minimatch or replacing the Firestore API package would risk runtime compatibility, so they are not applied. The application does not directly call glob/rimraf or pass user-controlled file patterns or abort signals to them; the packages remain in the production server dependency graph, so exposure is indirect and not zero.

CI runs `npm audit --omit=dev --audit-level=high`: it visibly reports moderate advisories and fails on high or critical advisories. This is a documented temporary policy decision, not a clean audit. Revisit when Firebase Admin's compatible dependency chain updates; do not deploy solely on the basis of a passing thresholded CI run without reviewing the audit output. No existing Firebase Admin, jose, or grpc override was changed. This policy does not add paid services or change the Firebase plan.

The Gemini API routes now have route-specific hourly limits plus a shared per-account ceiling of 30 requests per hour across Gemini routes, and generation inputs are bounded. This is not a project-wide spend cap or a concurrency semaphore. Usage accounting is still observational; hard quotas, API-key restrictions, and any billing controls must be checked in the Google console. The Firebase Firestore transaction counter is shared across app instances but is per account, not global across all accounts.
