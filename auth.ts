import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Nodemailer from "next-auth/providers/nodemailer";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/auth-schema";
import { invites, memberships, organizations, staff } from "@/db/schema";
import { checkSignInRateLimit } from "@/lib/rate-limit";

// Same static-allowlist pattern as spectral-ops/spectral-rnd/spectral-pilot's
// staff side -- internal Spectral team only.
const staffEmails = new Set(
  (process.env.ALLOWED_STAFF_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
);

// Two concurrent first-sign-in requests for the same brand-new email (two
// tabs, a prefetch racing the real load) used to both see no membership
// row and both provision a fresh org, leaving a silent duplicate. memberships
// .userId is now a unique constraint (db/schema.ts), and the whole
// provision runs in one transaction: if a concurrent request's insert wins
// the race first, this one's insert hits a 23505 unique-violation, the
// transaction (including its own org insert) rolls back atomically -- no
// orphaned org left behind either -- and a re-select picks up the winning
// row. Loops at most once more since the second select is guaranteed to
// find it.
async function provisionMembership(userId: string, email: string, name: string | null) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await db.transaction(async (tx) => {
        // A pending invite (see /app/team) takes priority over the normal
        // self-serve path -- this email was invited to an existing org, so
        // join that org at the invited role instead of provisioning a
        // brand-new one. Consumed once: delete the invite so a later
        // duplicate invite (or re-invite after removal) starts fresh.
        const [invite] = await tx.select().from(invites).where(eq(invites.email, email));
        let organizationId: string;
        let role: (typeof memberships.$inferInsert)["role"];
        if (invite) {
          organizationId = invite.organizationId;
          role = invite.role;
        } else {
          const [org] = await tx.insert(organizations).values({ name: name || email, accountTier: "general" }).returning();
          organizationId = org.id;
          role = "owner";
        }
        const [row] = await tx.insert(memberships).values({ userId, organizationId, role }).returning();
        if (invite) await tx.delete(invites).where(eq(invites.id, invite.id));
        return row;
      });
    } catch (err) {
      if ((err as { code?: string }).code === "23505") continue;
      throw err;
    }
  }
  const [row] = await db.select().from(memberships).where(eq(memberships.userId, userId));
  return row;
}

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
    // domains, no Google account assumed. Sent via Resend SMTP from
    // mail.spectralbiocontrol.com (verified domain, same Resend account as
    // spectral-pilot).
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    }),
  ],
  session: { strategy: "database" },
  callbacks: {
    async signIn({ user, account, email }) {
      // Staff must already be on the allowlist. Everyone else (grower
      // self-serve signup) is always allowed in -- org provisioning happens
      // in the session callback below, on first successful sign-in.
      const userEmail = user.email?.toLowerCase();
      if (!userEmail) return false;

      // Google is the staff-only sign-in path (see providers[] comment
      // below) -- but /api/auth/signin is one shared page for both /app
      // and /staff (proxy.ts), so nothing upstream actually stops a grower
      // visitor from clicking "Sign in with Google" instead of using
      // email. Without this check, any Google account -- not just staff --
      // would fall through to session()'s auto-provisioning and silently
      // get a brand-new grower org, with none of the throttling the
      // nodemailer path below has. Reject outright rather than rate-limit:
      // per-email throttling wouldn't meaningfully help here anyway, since
      // each abusive signup needs a distinct Google identity, not repeated
      // attempts on one.
      if (account?.provider === "google" && !staffEmails.has(userEmail)) {
        return false;
      }

      // email.verificationRequest is true specifically on the call that's
      // about to send a magic-link email (not the later call after the
      // grower clicks the link) -- the right checkpoint to throttle before
      // this triggers a real Resend send. Scoped to the nodemailer
      // provider only; Google (staff) sign-in is unaffected.
      if (account?.provider === "nodemailer" && email?.verificationRequest && !checkSignInRateLimit(userEmail)) {
        return false;
      }

      return true;
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
        session.membershipRole = null;
        session.organizationState = null;
        session.organizationConsentVersion = null;
        session.growerType = null;
        return session;
      }

      const [existingStaffRow] = await db.select().from(staff).where(eq(staff.userId, userId));
      if (existingStaffRow) {
        session.role = "staff";
        session.organizationId = null;
        session.accountTier = null;
        session.membershipRole = null;
        session.organizationState = null;
        session.organizationConsentVersion = null;
        session.growerType = null;
        return session;
      }

      let [membership] = await db.select().from(memberships).where(eq(memberships.userId, userId));
      if (!membership) {
        membership = await provisionMembership(userId, email, session.user?.name ?? null);
      }

      const [org] = await db.select().from(organizations).where(eq(organizations.id, membership.organizationId));
      session.role = "grower";
      session.organizationId = membership.organizationId;
      session.accountTier = org?.accountTier ?? "general";
      session.membershipRole = membership.role;
      session.organizationState = org?.state ?? null;
      session.organizationConsentVersion = org?.dataConsentVersion ?? null;
      session.growerType = org?.growerType ?? null;
      return session;
    },
  },
});
