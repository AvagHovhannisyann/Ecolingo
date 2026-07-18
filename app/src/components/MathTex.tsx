"use client";

import katex from "katex";
import "katex/dist/katex.min.css";
import { useMemo } from "react";

/**
 * KaTeX rendering with MathML output enabled for screen readers (IDEA-172).
 * Truth-critical: math is always rendered in code, never as an image (GATE-002).
 */
export function MathTex({ latex, block = false }: { latex: string; block?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(latex, {
        displayMode: block,
        throwOnError: false,
        output: "htmlAndMathml",
      }),
    [latex, block]
  );
  const Tag = block ? "div" : "span";
  return <Tag className={block ? "my-2 overflow-x-auto" : ""} dangerouslySetInnerHTML={{ __html: html }} />;
}
