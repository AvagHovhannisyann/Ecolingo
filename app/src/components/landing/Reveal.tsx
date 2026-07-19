"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Progressive-enhancement scroll reveal for the marketing landing page.
 *
 * Content is rendered fully visible in the server HTML (so the page works with
 * JS disabled and prerenders complete content). Only after mount — and only
 * when the visitor has NOT asked for reduced motion — do we arm the element
 * (data-reveal="pending" → hidden) and then fade it in as it scrolls into
 * view (data-reveal="in"). Reduced-motion users never see the class change,
 * so nothing ever animates and nothing is ever hidden from them.
 */
export function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduce.matches) return; // leave content visible, no animation

    el.dataset.reveal = "pending";

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.dataset.reveal = "in";
            io.unobserve(el);
          }
        }
      },
      { threshold: 0.16, rootMargin: "0px 0px -6% 0px" },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${className}`.trim()}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
