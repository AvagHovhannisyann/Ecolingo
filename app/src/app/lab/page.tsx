import Link from "next/link";

const LABS = [
  {
    href: "/lab/solow",
    title: "Solow growth",
    description: "Drag s, n, δ, α and A; watch actual vs break-even investment set the steady state.",
    status: "available" as const,
  },
  {
    href: "/lab/budget",
    title: "Intertemporal budget",
    description: "Rotate the budget line around the endowment; build the compensated line; lender vs borrower.",
    status: "available" as const,
  },
  { href: null, title: "Golden Rule (dedicated lab)", description: "Consumption-maximizing saving rate.", status: "planned" as const },
  { href: null, title: "Euler balance game", description: "Balance u′(c₁) against β(1+r)u′(c₂).", status: "planned" as const },
  { href: null, title: "PIH shock simulator", description: "Temporary vs permanent income shocks.", status: "planned" as const },
  { href: null, title: "Business-cycle classifier", description: "Pro-, counter- and acyclical variables.", status: "planned" as const },
  { href: null, title: "Fiscal policy sandbox", description: "Government spending, taxes and equilibrium.", status: "planned" as const },
];

export default function LabHubPage() {
  return (
    <div>
      <h1 className="text-xl font-semibold">Visual Labs</h1>
      <p className="mt-1 text-sm text-gray-600">
        Manipulate the models instead of reading about them. Every lab is computed from the model equations
        in code — the geometry always obeys the mathematics.
      </p>
      <ul className="mt-4 space-y-3">
        {LABS.map((lab) => (
          <li key={lab.title}>
            {lab.href ? (
              <Link href={lab.href} className="block rounded-2xl border border-gray-900 p-4 hover:bg-gray-50">
                <span className="font-medium">{lab.title}</span>
                <span className="block text-sm text-gray-600">{lab.description}</span>
              </Link>
            ) : (
              <div className="rounded-2xl border border-gray-200 bg-[var(--mist-gray)]/25 p-4">
                <span className="font-medium text-gray-700">🔒 {lab.title}</span>
                <span className="block text-sm text-gray-600">{lab.description} · scheduled (see roadmap)</span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
