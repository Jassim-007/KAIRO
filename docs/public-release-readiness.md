# FORM/AI public release readiness

## Implemented in this pass

- Added separate Plan, Guided Workout, Stats, and Exercise Library routes while retaining Overview, Shared, Tracker, and Tomorrow’s Workout navigation.
- Weekly routines are stored in the signed-in user’s workspace subcollection at workspaces/{workspaceId}/fitnessPlans/{uid}.
- Guided sessions support editable load, reps, and RIR, set completion, elapsed/rest timers, and persist completed set detail in shared workout records.
- Stats and the activity grid are derived from saved workout and weigh-in records. Exercise cues are original text; the app does not embed third-party exercise media.
- Overview date selection reads that date’s existing nutrition, hydration, weight, and workout data. It includes an editable weekly schedule, weight check-in, and a saved-record trend.
- AI chat turns persist in the owner-only server path users/{uid}/fitnessMemory/chat. Exact-date history questions are answered by authenticated server code from that user’s private records. Retrieved records are not added to Gemini prompts; generated historical answers are excluded from later AI context.
- Existing Auth, Firebase configuration, private nutrition/weight behavior, shared workout visibility, AI logging, and workspace pages remain in place.

## Deployment and backup checklist

- No Firebase deployment was performed. Review and deploy Firestore rules/indexes only after staging the application and verifying the target Firebase project.
- Confirm the production Firebase project and Authentication providers, authorized domains, Firestore database, and workspace membership flow.
- Configure Firebase Admin credentials and the Gemini API key as server-side deployment secrets. Do not commit .env.local or serviceAccountKey.json; both are ignored by Git.
- The current Firestore rules deny direct browser access; the server uses Admin SDK routes. Review every route’s owner/workspace checks before release because Admin SDK access bypasses Firestore rules.
- Recheck Firestore index needs from production logs. The supplied indexes currently include one weight composite index; the new plan and chat reads are document lookups.
- Back up the production Firestore database before deploying schema or application changes, and rehearse restore against a non-production project.
- Verify authentication, workspace creation/join, private data isolation, shared workout visibility, API rate limits, AI quota/error handling, and mobile layout with production-like accounts.
- Add a privacy notice and retention/export/deletion flow for persisted chat history before public release. Chat memory currently retains the most recent 80 messages per user.
- Configure domain, HTTPS, monitoring, error alerts, and a rollback plan in the selected hosting provider.

## Known limits

- This is a first functional pass, not a completed production launch. No live Firebase, Gemini, multi-account, or device-specific end-to-end verification was run here.
- Stats loads at most the first 100 workout records returned by the existing API. Older history is not paginated in this view yet.
- Muscle/fatigue summaries depend on exercise tags and are descriptive estimates, not medical or recovery assessments.
- The library uses original text guidance and simple placeholders, not exercise videos or licensed anatomical illustrations.
