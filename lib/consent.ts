// Bump this whenever the copy below materially changes what's collected or
// who can see it -- proxy.ts sends every org whose dataConsentVersion
// doesn't match this back through onboarding's consent step, without
// touching their already-saved name/state.
export const CURRENT_CONSENT_VERSION = "1.0";

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
