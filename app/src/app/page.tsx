import { redirect } from "next/navigation";

/**
 * Temporary home redirect (D-020). The learner home now lives at `/learn`; a
 * separate stream is building the real marketing landing page. The architect
 * will replace this one-liner with the landing page component when it lands —
 * keep it trivial to swap.
 */
export default function Home() {
  redirect("/learn");
}
