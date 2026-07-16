import { SolowLab } from "@/components/SolowLab";
import { UnverifiedBanner } from "@/components/CitationChips";

export default function SolowLabPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Visual Lab — Solow growth</h1>
      <p className="mt-1 text-sm text-gray-600">
        Every curve here is computed in code from the model equations — drag the parameters and the geometry
        must follow the mathematics (never the other way round).
      </p>
      <div className="mt-3">
        <UnverifiedBanner />
      </div>
      <div className="mt-4">
        <SolowLab />
      </div>
    </div>
  );
}
