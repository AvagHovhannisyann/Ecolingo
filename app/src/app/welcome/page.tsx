import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Nunito } from "next/font/google";
import { Reveal } from "@/components/landing/Reveal";
import "./landing.css";

/**
 * Ecolingo marketing landing (LIGHT). Built self-contained under /welcome so
 * the architect can move it to `/` at merge. Everything is scoped under the
 * `.landing` wrapper (see landing.css), which also owns the Duolingo-parity
 * colour tokens and neutralises the inherited app chrome — the page stays
 * light and full-bleed regardless of what the app shell does.
 *
 * Expressive rounded display type via Nunito (closest free analog to
 * Duolingo's feather/din-round): 800/900 for display, 500/700 for body.
 */
const nunito = Nunito({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800", "900"],
  variable: "--font-landing",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Ecolingo — hard ideas. made intuitive.",
  description:
    "The free, fun, and effective way to master real university courses — one bite-sized lesson at a time.",
};

/* Inline sprout leaf for the wordmark (decorative). */
function LeafMark() {
  return (
    <svg className="l-wordmark__leaf" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 21V11"
        fill="none"
        stroke="#58a700"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M12 12C12 8 9 5 4 5c0 5 3 8 8 8Z"
        fill="#58cc02"
        stroke="#58a700"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M12.4 11.2C12.4 7.6 15 4.8 20 4.8c0 4.6-2.6 7.4-7.6 7.4Z"
        fill="#7ed321"
        stroke="#58a700"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      fill="none"
      stroke="#58a700"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 15V4" />
      <path d="m8 8 4-4 4 4" />
      <path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      fill="none"
      stroke="#1177bb"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 20V4" />
      <path d="M4 20h16" />
      <path d="M8 20v-6" />
      <path d="M13 20V9" />
      <path d="M18 20v-9" />
    </svg>
  );
}

const BENEFITS = [
  {
    id: "science",
    flip: false,
    disc: "green" as const,
    img: "/art/creature-thinking.webp",
    alt: "Ecolingo mascot thinking, with a spark of understanding",
    heading: "backed by learning science.",
    text: "Spaced repetition brings each idea back exactly when you're about to forget it. Mastery is tracked across five skill dimensions — so you always know what's solid and what needs another pass.",
  },
  {
    id: "motivation",
    flip: true,
    disc: "blue" as const,
    img: "/art/creature-celebrating.webp",
    alt: "Ecolingo mascot celebrating a win",
    heading: "staying motivated is the point.",
    text: "Streaks, quests, and XP turn studying into a habit you actually keep — with a mascot that celebrates every win alongside you. Effortless momentum, zero shame.",
  },
  {
    id: "personalized",
    flip: false,
    disc: "yellow" as const,
    img: "/art/creature-determined.webp",
    alt: "Ecolingo mascot looking determined and ready",
    heading: "personalized to your pace.",
    text: "Lessons and question difficulty are tailored by AI to where you are right now — and level up automatically as you get stronger. Never too easy, never overwhelming.",
  },
];

export default function WelcomePage() {
  return (
    <div className={`${nunito.variable} landing`}>
      {/* ---------------------------------------------------------------- Nav */}
      <header className="l-nav">
        <div className="l-container l-nav__inner">
          <Link href="/welcome" className="l-wordmark" aria-label="Ecolingo home">
            <LeafMark />
            ecolingo
          </Link>
          <Link href="/learn" className="l-link l-link--caps">
            I already have an account
          </Link>
        </div>
      </header>

      {/* --------------------------------------------------------------- Hero */}
      <section className="l-hero" aria-labelledby="hero-heading">
        <div className="l-container l-hero__grid">
          {/*
            Placeholder hero mascot from the existing art set. The art stream
            (Fabel) will supply a bespoke hero mascot illustration at merge.
          */}
          <div className="l-hero__art l-anim--art">
            <Image
              className="l-hero__mascot"
              src="/art/creature-waving.webp"
              alt="Ecolingo's friendly sprout mascot waving hello"
              width={512}
              height={512}
              priority
              sizes="(min-width: 720px) 420px, 78vw"
            />
          </div>

          <div className="l-hero__copy">
            <h1 id="hero-heading" className="l-anim l-anim--1">
              hard ideas. made intuitive.
            </h1>
            <p className="l-hero__lede l-anim l-anim--2">
              The free, fun, and effective way to master real university
              courses — one bite-sized lesson at a time.
            </p>
            <div className="l-cta-stack l-anim l-anim--3">
              <Link
                href="/onboarding"
                className="l-btn l-btn--primary l-btn--block"
              >
                Get started
              </Link>
              <Link
                href="/learn"
                className="l-btn l-btn--secondary l-btn--block"
              >
                I already have an account
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- Benefits */}
      <section className="l-benefits" aria-label="Why Ecolingo works">
        <div className="l-container">
          {BENEFITS.map((b) => (
            <Reveal
              key={b.id}
              className={`l-benefit${b.flip ? " l-benefit--flip" : ""}`}
            >
              <div className={`l-benefit__art l-benefit__art--${b.disc}`}>
                <Image
                  className="l-benefit__img"
                  src={b.img}
                  alt={b.alt}
                  width={360}
                  height={360}
                  sizes="(min-width: 720px) 260px, 58vw"
                />
              </div>
              <div>
                <h2>{b.heading}</h2>
                <p className="l-benefit__text">{b.text}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- Teacher band */}
      <section className="l-teach" aria-labelledby="teach-heading">
        <div className="l-container">
          <div className="l-teach__head">
            <span className="l-teach__eyebrow">For teachers &amp; classrooms</span>
            <h2 id="teach-heading">bring your course to life.</h2>
          </div>
          <div className="l-cards">
            <Reveal className="l-card">
              <span className="l-card__icon l-card__icon--green" aria-hidden="true">
                <UploadIcon />
              </span>
              <h3>Ecolingo for Teachers</h3>
              <p className="l-card__text">
                Upload your course materials — books, slides, lectures — and AI
                compiles them into a playable course your students actually
                finish.
              </p>
              <Link
                href="/teach"
                className="l-btn l-btn--primary l-card__cta"
              >
                Create your course
              </Link>
            </Reveal>

            <Reveal className="l-card" delay={90}>
              <span className="l-card__icon l-card__icon--blue" aria-hidden="true">
                <ChartIcon />
              </span>
              <h3>Class Analytics</h3>
              <p className="l-card__text">
                See exactly what your class is mastering and what to reteach
                next — turned into a clear plan from live student progress.
              </p>
              <Link href="/teach/analytics" className="l-link">
                See class analytics →
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------------- Final CTA */}
      <section className="l-final" aria-labelledby="final-heading">
        <div className="l-container">
          <Reveal>
            <h2 id="final-heading">learn anything. seriously.</h2>
            <p className="l-final__text">
              Start your first lesson in under a minute. It&apos;s free.
            </p>
            <Link
              href="/onboarding"
              className="l-btn l-btn--primary l-final__cta"
            >
              Get started
            </Link>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ Footer */}
      <footer className="l-footer">
        <div className="l-container l-footer__inner">
          <nav className="l-footer__links" aria-label="Footer">
            <Link href="/teach" className="l-link">
              Teachers
            </Link>
            <Link href="/teach/analytics" className="l-link">
              Analytics
            </Link>
            <Link href="/onboarding" className="l-link">
              Get started
            </Link>
            <Link href="/learn" className="l-link">
              Log in
            </Link>
          </nav>
          <p className="l-footer__note">
            <span className="l-footer__brand">ecolingo</span> — the free, fun,
            effective way to learn hard things.
          </p>
        </div>
      </footer>
    </div>
  );
}
