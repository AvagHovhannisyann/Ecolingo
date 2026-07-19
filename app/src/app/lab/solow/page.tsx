import Link from "next/link";
import { SolowLab } from "@/components/SolowLab";
import { UnverifiedBanner } from "@/components/CitationChips";
import "@/components/lab/lab.css";

export default function SolowLabPage() {
  return (
    <div>
      <Link href="/lab" className="text-sm font-bold text-[color:var(--duo-blue-text)] hover:underline">
        ← All labs
      </Link>
      <h1 className="mt-2 text-2xl font-extrabold">
        <span className="lab-panel-icon mr-2" aria-hidden>
          📈
        </span>
        Visual Lab — Solow growth
      </h1>
      <p className="mt-1 text-sm text-app-muted">
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
