"use client";

import { useRouter } from "next/navigation";
import SymptomCheckFlow from "./SymptomCheckFlow";

export default function SymptomCheckPageClient() {
  const router = useRouter();
  return <SymptomCheckFlow onClose={() => router.push("/app")} />;
}
