# FORM/AI Fitness Tracker

A mobile-friendly fitness tracker for a couple or small invite-only group. The app combines manual trackers with an optional natural-language capture flow.

## Current features

- Firebase account sign-in and an invite-only, two-person couple workspace.
- Private nutrition, water, and weight entries with personal goals and progress.
- Couple-visible workout history, with workout type, exercises, sets, reps, and load.
- A persistent Quick Log panel that can turn one natural-language note into reviewable drafts for meals, hydration, weight, or workouts. It saves nothing until the user confirms.
- Installable web app metadata for mobile browsers.

AI-created nutrition values are marked as estimates. Quick Log sends only the note entered by the user and its date to Google Gemini; it does not send stored history. See [AI capture setup](docs/AI_CAPTURE_SETUP.md).

## Local setup

1. Install dependencies with `npm install`.
2. Create `.env.local` with the Firebase client configuration values:
   `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`, and `NEXT_PUBLIC_FIREBASE_APP_ID`.
3. Put the Firebase Admin service account JSON at `serviceAccountKey.json` in the project root. That credential and local environment files are ignored by Git; never commit them.
4. To enable AI capture, set `GEMINI_API_KEY` server-side. `GEMINI_MODEL` is optional. Never expose either value with a `NEXT_PUBLIC_` prefix.
5. Signed-in users can view their own Gemini usage from **AI usage**. Request attempts are counted; input and output tokens are summed from Gemini usageMetadata when returned. To show a cost estimate, optionally set `GEMINI_INPUT_USD_PER_MILLION_TOKENS` and `GEMINI_OUTPUT_USD_PER_MILLION_TOKENS` to the current rates for the configured model. Keep these server-side, update them when model pricing changes, and treat the result as an estimate rather than an invoice.
5. Run `npm run dev` and open `http://localhost:3000`.

Before using a deployed instance, deploy the checked-in Firestore rules and indexes with the Firebase CLI. Browser reads and writes are disabled; the authenticated Next.js API routes use the Admin SDK and enforce ownership checks.

Without `GEMINI_API_KEY`, manual tracking continues to work and Quick Log will explain that AI is not configured. Free model quotas and provider data terms can change; review them before enabling this for more users.

## Mobile and Android

The app includes a web manifest and can be installed from a supporting mobile browser. A native Android package, background sync, and offline write queue are not included yet.

## Data visibility

Nutrition, water, weight, and personal goals are private to the account. Workout logs are readable by both members of the couple workspace. Only the person who logged a workout can edit or delete it.

## Personal data export and retention

From **Account settings → Your data**, a signed-in member can download a versioned JSON export of their profile, nutrition and water entries they logged, their weight entries, workouts whose subject is their account, personal goals, water goal, workout plan, exercise library, and saved AI chat memory. A workout about the member is included even when their workspace partner logged it, because workout history is shared. The export excludes the other member's profile and personal records, workspace invitations and membership data, authentication credentials, API usage/rate-limit metadata, and Firebase Storage files. The file contains sensitive health and chat information; store it privately. The export is for portability and is not an import/restore file.

Fitness records and profile data have no automatic expiry configured. Saved AI chat memory retains only the latest 80 messages. Members can remove records through the app where supported; deleting an account removes that member's personal data while retaining another member's data. AI provider retention is governed by the provider's current terms; see [AI capture setup](docs/AI_CAPTURE_SETUP.md).

## Backup and recovery

The personal JSON export is not a full backup. For disaster recovery, an operator should configure recurring Cloud Firestore managed exports to a private Cloud Storage bucket in the Firebase/Google Cloud project, set bucket access and lifecycle retention deliberately, and separately document recovery of Firebase Authentication users and any Storage objects. Firestore exports do not back up Firebase Authentication. Protect export files and bucket access as sensitive health data; do not commit exports, service-account credentials, or environment files.

To recover, restore a selected Firestore export into a separate staging project first, validate rules, indexes, workspace membership, and representative two-member privacy behavior, then plan any production cutover explicitly. Avoid importing into the live project as an exploratory recovery step: imports can overwrite existing document state. This repository does not configure, schedule, or run backups, and no backup or restore has been performed as part of this change. Consult the current Google Cloud documentation and project billing/permissions before configuring managed exports.

