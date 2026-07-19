import type { Metadata } from "next";
import { ShopIcon } from "@/components/icons";

export const metadata: Metadata = { title: "Shop — Ecolingo" };

/**
 * Shop placeholder (D-020). A later stream builds the real shop (spend gems on
 * hearts refills, streak freezes, and power-ups). This is an honest empty
 * state — title + one-line description — so the route never 404s.
 */
export default function Shop() {
  return (
    <section className="mt-2">
      <h1 className="text-2xl font-black">Shop</h1>
      <p className="mt-1 text-app-muted">Spend the gems you earn on power-ups that keep you going.</p>
      <div className="card mt-6 flex flex-col items-center gap-4 p-10 text-center">
        <ShopIcon className="h-16 w-16 art-enter" />
        <p className="max-w-sm text-app-muted">
          Items will appear here once the shop opens — streak freezes, heart refills, and more.
        </p>
      </div>
    </section>
  );
}
