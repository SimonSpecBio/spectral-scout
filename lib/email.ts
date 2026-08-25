import nodemailer from "nodemailer";

// Same EMAIL_SERVER/EMAIL_FROM env vars auth.ts's Nodemailer provider
// already sends real magic-link sign-in emails through in production
// (Resend SMTP, mail.spectralbiocontrol.com -- see auth.ts's comment).
// This is a plain transactional send outside NextAuth's own flow, for
// anything that needs to email a specific address on its own schedule
// (ticket 91's re-engagement nudge) rather than as part of a sign-in.
let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;
function getTransporter() {
  if (!transporter) {
    if (!process.env.EMAIL_SERVER) throw new Error("EMAIL_SERVER is not set");
    transporter = nodemailer.createTransport(process.env.EMAIL_SERVER);
  }
  return transporter;
}

export async function sendEmail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void> {
  await getTransporter().sendMail({ to, from: process.env.EMAIL_FROM, subject, text });
}
