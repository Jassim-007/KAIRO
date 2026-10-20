# Enable AI natural-language capture

Set these server-side environment variables in local development or the deployment secret manager:

- `GEMINI_API_KEY` — required. Never use a `NEXT_PUBLIC_` prefix.
- `GEMINI_MODEL` — optional; defaults to `gemini-3.5-flash-lite`.

Quick Log sends only the note the user submits and its selected date to Gemini. It does not send stored nutrition, weight, water, or workout history. AI creates a draft; records are saved only after the user confirms. Nutrition values estimated by the model are marked in the draft and on the saved meal.

Nutrition, water, and weight records are private to each account. Workouts are visible to both members in the couple workspace. Check the selected model's current quota, pricing, and data terms before enabling AI for other users; free availability and limits can change.