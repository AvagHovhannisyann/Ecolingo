import type { Metadata } from "next";
import { Suspense } from "react";
import { OAuthCallbackClient } from "@/components/auth/OAuthCallbackClient";

export const metadata: Metadata = { title: "Signing you in — Ecolingo" };

export default function OAuthCallbackPage() {
  return (
    <Suspense>
      <OAuthCallbackClient />
    </Suspense>
  );
}
