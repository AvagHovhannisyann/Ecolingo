import type { Metadata } from "next";
import { VideoStudioClient } from "@/components/teach/VideoStudioClient";

export const metadata: Metadata = {
  title: "Video studio — Ecolingo",
  description: "Generate short illustrative clips with an open-source text-to-video model.",
};

export default function TeachVideoPage() {
  return <VideoStudioClient />;
}
