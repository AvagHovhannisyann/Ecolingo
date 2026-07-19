"use client";

/**
 * Accessible radio-group of big option cards for the onboarding survey.
 * Whole card is clickable; keyboard behaviour follows the ARIA radiogroup
 * pattern — roving tabIndex, arrow keys move + select (wrapping), Space/Enter
 * select the focused card. Selection colour is blue (never green — green is
 * reserved for "correct", per the design system).
 */

import { useRef } from "react";

export interface OptionItem<T extends string> {
  value: T;
  label: string;
  hint?: string;
  /** decorative emoji glyph shown left of the label */
  icon?: string;
}

export function OptionCards<T extends string>({
  name,
  labelledBy,
  options,
  value,
  onChange,
  columns = 1,
}: {
  name: string;
  /** id of the question heading that labels this group */
  labelledBy: string;
  options: readonly OptionItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  columns?: 1 | 2;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const focusAt = (i: number) => {
    const n = options.length;
    const idx = ((i % n) + n) % n;
    onChange(options[idx].value);
    refs.current[idx]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    switch (e.key) {
      case "ArrowDown":
      case "ArrowRight":
        e.preventDefault();
        focusAt(i + 1);
        break;
      case "ArrowUp":
      case "ArrowLeft":
        e.preventDefault();
        focusAt(i - 1);
        break;
      case " ":
      case "Enter":
        e.preventDefault();
        onChange(options[i].value);
        break;
      default:
        break;
    }
  };

  // Roving tabIndex: the selected card is the single tab stop; if nothing is
  // selected yet, the first card takes the tab stop.
  const activeIndex = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  );

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      className={`option-cards${columns === 2 ? " option-cards--grid" : ""}`}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            name={name}
            tabIndex={i === activeIndex ? 0 : -1}
            ref={(el) => {
              refs.current[i] = el;
            }}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`option-card${selected ? " option-card--selected" : ""}`}
          >
            {o.icon && (
              <span aria-hidden="true" className="option-card__icon">
                {o.icon}
              </span>
            )}
            <span className="option-card__body">
              <span className="option-card__label">{o.label}</span>
              {o.hint && <span className="option-card__hint">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
