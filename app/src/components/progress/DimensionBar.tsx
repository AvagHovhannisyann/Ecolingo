"use client";

/**
 * One labeled mastery-dimension bar (§22). A fat rounded track on the dark
 * surface with a green fill, an accessible progressbar role, and a visible
 * numeric value — screen readers and sighted learners get the same number.
 */

export function DimensionBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  return (
    <div className="pg-dim">
      <span className="pg-dim-label">{label}</span>
      <div
        className="pg-bar"
        role="progressbar"
        aria-label={`${label} mastery`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-valuetext={`${pct}%`}
      >
        <div className="pg-bar-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="pg-dim-value">{pct}%</span>
    </div>
  );
}
