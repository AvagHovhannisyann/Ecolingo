import Link from "next/link";
import { BudgetLab } from "@/components/BudgetLab";
import { UnverifiedBanner } from "@/components/CitationChips";
import "@/components/lab/lab.css";

export default function BudgetLabPage() {
  return (
    <div>
      <Link href="/lab" className="text-sm font-bold text-[color:var(--duo-blue-text)] hover:underline">
        ← All labs
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold">
        <span className="lab-panel-icon mr-2" aria-hidden>
          ⚖️
        </span>
        Visual Lab — Intertemporal budget
      </h1>
      <p className="mt-1 text-sm text-app-muted">
        Change the interest rate and watch the budget line rotate around the endowment. Build the
        compensated line to separate substitution and income effects — every point is computed from the
        model, never drawn by hand.
      </p>
      <div className="mt-3">
        <UnverifiedBanner />
      </div>
      <div className="mt-4">
        <BudgetLab />
      </div>
    </div>
  );
}
