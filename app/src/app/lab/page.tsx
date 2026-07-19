import Link from "next/link";
import "@/components/lab/lab.css";

/* Chooser data — icon/accent are purely presentational (D-020 game surface);
   titles, descriptions and routes are unchanged. */
const LABS = [
  {
    href: "/lab/solow",
    title: "Solow growth",
    description: "Drag s, n, δ, α and A; watch actual vs break-even investment set the steady state.",
    status: "available" as const,
    icon: "📈",
    accent: "green" as const,
  },
  {
    href: "/lab/budget",
    title: "Intertemporal budget",
    description: "Rotate the budget line around the endowment; build the compensated line; lender vs borrower.",
    status: "available" as const,
    icon: "⚖️",
    accent: "blue" as const,
  },
  { href: null, title: "Golden Rule (dedicated lab)", description: "Consumption-maximizing saving rate.", status: "planned" as const, icon: "🏆", accent: "green" as const },
  { href: null, title: "Euler balance game", description: "Balance u′(c₁) against β(1+r)u′(c₂).", status: "planned" as const, icon: "🎯", accent: "blue" as const },
  { href: null, title: "PIH shock simulator", description: "Temporary vs permanent income shocks.", status: "planned" as const, icon: "⚡", accent: "green" as const },
  { href: null, title: "Business-cycle classifier", description: "Pro-, counter- and acyclical variables.", status: "planned" as const, icon: "🔄", accent: "blue" as const },
  { href: null, title: "Fiscal policy sandbox", description: "Government spending, taxes and equilibrium.", status: "planned" as const, icon: "🏛️", accent: "green" as const },
];

export default function LabHubPage() {
  return (
    <div>
      <h1 className="text-2xl font-extrabold">Visual Labs</h1>
      <p className="mt-1 text-sm text-app-muted">
        Manipulate the models instead of reading about them. Every lab is computed from the model equations
        in code — the geometry always obeys the mathematics.
      </p>
      <ul className="mt-5 grid gap-3 sm:grid-cols-2">
        {LABS.map((lab) => (
          <li key={lab.title}>
            {lab.href ? (
              <Link href={lab.href} className="lab-card">
                <span className={`lab-card-icon lab-card-icon--${lab.accent}`} aria-hidden>
                  {lab.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-extrabold">{lab.title}</span>
                  <span className="mt-0.5 block text-sm text-app-muted">{lab.description}</span>
                  <span className="lab-card-cta">Open lab →</span>
                </span>
              </Link>
            ) : (
              <div className="lab-card lab-card--locked">
                <span className="lab-card-icon" aria-hidden>
                  {lab.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-base font-extrabold text-app-muted">🔒 {lab.title}</span>
                  <span className="mt-0.5 block text-sm text-app-faint">{lab.description} · scheduled (see roadmap)</span>
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
