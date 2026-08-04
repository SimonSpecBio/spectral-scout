import { redirect } from "next/navigation";

// Map is home per the design brief -- this route only exists so /app still
// resolves to something (e.g. the post-sign-in redirect target).
export default function AppIndex() {
  redirect("/app/map");
}
