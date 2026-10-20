
import Link from "next/link";

const sections = [
  {
    title: "1. Information KAIRO collects",
    content:
      "KAIRO may store your name, email address, account information, workouts, exercises, sets, reps, weights, body-weight records, nutrition logs, calories, hydration, fitness goals, and progress history. AI features may also process the prompts and fitness information you choose to provide.",
  },
  {
    title: "2. Sharing with your connected partner",
    content:
      "Information saved in your shared workspace may be visible to your connected partner, including shared workouts, nutrition, hydration, body weight, goals, and progress, depending on the features you use. Only connect with someone you trust. Your password and authentication credentials are not intended to be shared.",
  },
  {
    title: "3. AI processing",
    content:
      "When you use KAIRO's AI features, relevant prompts and fitness context may be sent to Google's Gemini service to generate a response. AI responses can be inaccurate and are not a substitute for professional medical advice. Google's handling and retention of submitted information are governed by the applicable provider terms and policies; KAIRO does not promise a specific retention period here.",
  },
  {
    title: "4. Storage and security",
    content:
      "KAIRO uses Firebase services for authentication and data storage. Security controls are designed to restrict access to authorized users and shared workspace members. No online service can guarantee absolute security. Keep your password private and sign out on devices you do not control.",
  },
  {
    title: "5. Account and workspace deletion",
    content:
      "When the workspace owner deletes their account, KAIRO's current deletion flow removes the shared workspace and its associated shared data, workspace memberships and invitations, the owner's personal app data, and the owner's Firebase Authentication account. Other members may lose access to shared information. KAIRO does not currently transfer workspace ownership as part of deletion. Information already processed by an external provider or retained where legally required may be subject to separate retention policies.",
  },
  {
    title: "6. Your choices",
    content:
      "You choose what information to enter, whether to use AI features, and whether to connect a partner. Review what is visible in your shared workspace before adding personal information. Avoid entering passwords or unnecessary sensitive information into AI prompts.",
  },
  {
    title: "7. Changes and questions",
    content:
      "This notice may change as KAIRO's features and data practices evolve. The latest version should be available in the app. For questions about your information, contact the KAIRO app operator using the contact details provided in the app.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#111329] px-5 py-10 text-[#faf7f0] sm:px-8">
      <article className="mx-auto max-w-3xl">
        <Link
          href="/login"
          className="text-sm text-[#f9df83] underline underline-offset-4"
        >
          ← Back to KAIRO
        </Link>

        <header className="mb-8 mt-8">
          <p className="text-xs font-bold uppercase tracking-[0.25em] text-[#f9df83]">
            KAIRO · Privacy
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">
            Privacy Notice
          </h1>
          <p className="mt-3 text-sm text-white/60">
            Last updated: October 20, 2026
          </p>
          <p className="mt-5 leading-7 text-white/80">
            This notice explains what information KAIRO handles, what your
            connected partner may see, how AI features process information,
            and what happens when an account is deleted.
          </p>
        </header>

        <div className="space-y-4">
          {sections.map((section) => (
            <section
              key={section.title}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 sm:p-6"
            >
              <h2 className="text-lg font-semibold text-[#f9df83]">
                {section.title}
              </h2>
              <p className="mt-3 text-sm leading-7 text-white/75">
                {section.content}
              </p>
            </section>
          ))}
        </div>

        <footer className="mt-8 border-t border-white/10 pt-5 text-sm text-white/50">
          KAIRO · YOUR MOMENT · YOUR MOMENTUM
        </footer>
      </article>
    </main>
  );
}
