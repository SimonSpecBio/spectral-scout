// Bump this whenever the copy below materially changes what's collected or
// who can see it -- proxy.ts sends every org whose dataConsentVersion
// doesn't match this back through onboarding's consent step, without
// touching their already-saved name/state.
//
// 1.0 -> 1.1 (ticket 83): added the "Anonymized benchmarking" bullet below.
// Free-tier resolution-time/product data can now surface as a pooled,
// aggregate-only comparison to OTHER growers inside the app (not just to
// Spectral staff, which 1.0 already covered) -- a genuinely new "who can
// see derived-from-your-data stats" story, so this counts as material.
//
// 1.1 -> 1.2 (compliance audit, 2026-08-27): added "Your rights" (naming
// the real, working Settings tools -- export and delete -- that didn't
// exist before this pass) and "Who else can access it" (sub-processor
// disclosure: Vercel, Supabase, Resend, web push relays). Neither changes
// what's collected, but both are new, real disclosures about rights and
// third parties that weren't stated anywhere before -- material under this
// file's own "who can see it" standard.
export const CURRENT_CONSENT_VERSION = "1.2";

export interface ConsentSection {
  heading: string;
  paragraphs: string[];
}

// DRAFT COPY -- reviewed against the real code (lib/session.ts's
// canStaffViewOrgDetail, db/schema.ts) so it's accurate to what the app
// actually does today, but this is NOT a substitute for an actual lawyer's
// review before it's presented as a binding agreement to real users.
// Placeholders below (support email, finalized date) still need filling in.
// Shared by the onboarding consent modal and the read-only Settings review
// page so the two can never drift out of sync with each other.
export const CONSENT_SECTIONS: ConsentSection[] = [
  {
    heading: "What this agreement covers",
    paragraphs: [
      "Spectral Scout is a free pest-scouting and crop-protection tool built by Spectral Biocontrol. This explains what information we collect when you use it, who inside Spectral can see it, and what you're agreeing to by creating an account.",
    ],
  },
  {
    heading: "What we collect",
    paragraphs: [
      "Your organization name, state, and city (used to show you which pesticides and biocontrol products are actually legal to use where you are -- state cannabis/pesticide rules vary a lot).",
      "Facility and area layouts you create (site maps, benches, rooms).",
      "Scouting observations you log -- pest counts, leaf-infestation checks, environmental readings.",
      "Pest and disease events, and the treatments you apply to them, including product names, quantities, and application dates.",
      "Inventory records for beneficial insects, biopesticides, and other products you track in the app.",
      "Photos you upload of pests, damage, or treatments.",
      "Basic account info (email, name) via whichever sign-in method you use.",
    ],
  },
  {
    heading: "Who at Spectral can see it",
    paragraphs: [
      "If your organization has a paid pilot/partnership relationship with Spectral Biocontrol (\"pilot\" accounts): Spectral staff can see your organization's full data, the same way they would for any customer relationship where we're actively supporting your operation.",
      "If you signed up for the free, self-serve version (\"general\" accounts) -- the default for anyone who just creates an account without a separate agreement: our application is built so staff-facing screens never surface your organization-identifiable data. The only thing Spectral staff see from free-tier usage through the app is aggregated, anonymized statistics across all free-tier users combined -- never anything traceable back to your account. (This describes what our software shows staff, not a claim about every possible way our systems could technically be accessed -- see our security practices for more.)",
      "If your account's tier ever changes, we'll tell you before that changes what Spectral staff can see.",
    ],
  },
  {
    heading: "Anonymized benchmarking",
    paragraphs: [
      "If you're on the free, self-serve tier: we may show you pooled, aggregate statistics computed across all free-tier growers combined -- for example, whether growers who used one product against a given pest tended to resolve it faster than growers who used another. These comparisons are never shown unless enough different growers' outcomes are behind each side of the comparison, specifically so no single grower's own result can be picked out of it. This never includes labor/time-tracking data, and it works the same way as the staff-visible aggregates described above: pooled and anonymous, never traceable back to your account.",
    ],
  },
  {
    heading: "What we don't do",
    paragraphs: [
      "We don't sell your data to third parties.",
      "We don't share your specific scouting or treatment data with other growers.",
      "We don't use your data to make decisions about your business outside of the app itself -- compliance with pesticide/state law is your responsibility as the grower, and the app's product-legality info is a reference tool, not a substitute for checking the current label and your state's rules yourself.",
    ],
  },
  {
    heading: "Photos and file storage",
    paragraphs: [
      "Photos you upload are stored with our cloud storage provider (Vercel Blob) at an unguessable, unlisted address -- the app only ever shows them to your organization's own members and, for pilot-tier accounts, Spectral staff per the above. Photos are stripped of location (GPS) metadata before storage.",
    ],
  },
  {
    heading: "Who else can access it",
    paragraphs: [
      "We use a small number of infrastructure providers to run the app -- they process your data on our behalf, never for their own purposes: Vercel (hosting, and photo storage via Vercel Blob), Supabase (our database, hosted in the United States), and Resend (delivering sign-in and notification emails). If you enable push notifications, your device's browser/OS push service (e.g. Google, Apple, or Mozilla) relays those.",
      "Your data is processed and stored in the United States. If you're located outside the US, that means it crosses a border to get there.",
    ],
  },
  {
    heading: "Your rights",
    paragraphs: [
      "You can download a copy of everything in your account (Settings -> Your data -> Export my data) or permanently delete your account (Settings -> Your data -> Delete my account) at any time, yourself, without waiting on us. Deleting your account also deletes your entire organization's data if you're its only member -- if you have teammates, only your own login and membership are removed.",
      "Depending on where you live, you may also have the right to correct inaccurate information we hold about you, or to ask what we've collected and why, beyond what self-serve export already gives you. Reach out using the contact info below for anything the in-app tools don't cover.",
      "We won't treat you differently or degrade the app for exercising any of these rights.",
    ],
  },
  {
    heading: "Changes to this agreement",
    paragraphs: [
      "If we materially change what we collect or who can see it, we'll ask you to review and re-accept before you can keep using the app -- not just post an update and assume you saw it.",
    ],
  },
  {
    heading: "Questions",
    paragraphs: ["Contact Spectral Biocontrol at [insert real support email] with any questions about this agreement or your data."],
  },
];
