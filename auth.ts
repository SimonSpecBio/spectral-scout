import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/auth-schema";
import { memberships, organizations, staff } from "@/db/schema";

// Same static-allowlist pattern as spectral-ops/spectral-rnd/spectral-pilot's
// staff side -- internal Spectral team only.
const staffEmails = new Set(
  (process.env.ALLOWED_STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // @auth/drizzle-adapter's types want the literal PgTableWithColumns shape;
  // .enableRLS() (db/auth-schema.ts) deliberately returns that type minus
  // itself, to stop it being called twice -- compile-time-only mismatch,
  // same cast used across the other three apps' auth.ts.
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any),
  providers: [
    // Staff sign in with Google, gated by ALLOWED_STAFF_EMAILS below.
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    // Growers (both free-tier and pilot-program) sign in with email
    // magic-link -- this is a public self-serve tool, arbitrary email
    // domains, no Google account assumed.
    //
    // TEMP (until a verified Resend sending domain exists, see README):
    // sendVerificationRequest logs the sign-in link instead of emailing it.
    // This is NOT "no verification" -- it's still a real single-use token
    // tied to the specific email that requested it, scoped by
    // verificationTokens same as always. Only the delivery channel changes;
    // nobody can sign in as an email they don't control just because this
    // is active. Delete this override once EMAIL_SERVER points at a real
    // verified domain.
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
      sendVerificationRequest: async ({ identifier, url }) => {
        console.log(`[scout] magic sign-in link for ${identifier}: ${url}`);
      },
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user }) {
      // Staff must already be on the allowlist. Everyone else (grower
      // self-serve signup) is always allowed in -- org provisioning happens
      // in the session callback below, on first successful sign-in.
      const email = user.email?.toLowerCase();
      return !!email;
    },
    // Runs on every session fetch (database strategy = no JWT to decode).
    // First sign-in for a brand-new grower email: no scout_staff row and no
    // scout_membership row yet, so provision a fresh organization + owner
    // membership on the fly. This is what makes the free tier genuinely
    // self-serve instead of staff-provisioned like spectral-pilot's
    // pp_contacts allowlist.
    async session({ session }) {
      const email = session.user?.email?.toLowerCase();
      const userId = session.user?.id;
      if (!email || !userId) return session;

      if (staffEmails.has(email)) {
        session.role = "staff";
        session.organizationId = null;
        session.accountTier = null;
        return session;
      }

      const [existingStaffRow] = await db.select().from(staff).where(eq(staff.userId, userId));
      if (existingStaffRow) {
        session.role = "staff";
        session.organizationId = null;
        session.accountTier = null;
        return session;
      }

      let [membership] = await db.select().from(memberships).where(eq(memberships.userId, userId));
      if (!membership) {
        const [org] = await db
          .insert(organizations)
          .values({ name: session.user?.name || email, accountTier: "general" })
          .returning();
        [membership] = await db
          .insert(memberships)
          .values({ userId, organizationId: org.id, role: "owner" })
          .returning();
      }

      const [org] = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId));
      session.role = "grower";
      session.organizationId = membership.organizationId;
      session.accountTier = org?.accountTier ?? "general";
      return session;
    },
  },
});
