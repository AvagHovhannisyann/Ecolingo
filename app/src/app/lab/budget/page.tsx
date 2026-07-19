import { BudgetLab } from "@/components/BudgetLab";
import { UnverifiedBanner } from "@/components/CitationChips";

export default function BudgetLabPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Visual Lab — Intertemporal budget</h1>
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
