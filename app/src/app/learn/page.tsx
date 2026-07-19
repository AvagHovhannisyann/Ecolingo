import { HomeClient } from "@/components/HomeClient";

/**
 * The learner home ("Learn" — today's plan + skill path). Moved here from `/`
 * (D-020 route restructure); `/` is now a trivial redirect to `/learn` until
 * the marketing landing stream swaps in the real landing page.
 */
export default function Learn() {
  return <HomeClient />;
}
