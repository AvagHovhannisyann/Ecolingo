import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthClient } from "@/components/auth/AuthClient";

export const metadata: Metadata = { title: "Log in — Ecolingo" };

/** Real accounts (D-022): login / signup with the guest-upgrade flow. */
export default function AuthPage() {
  return (
    <Suspense>
      <AuthClient />
    </Suspense>
  );
}
