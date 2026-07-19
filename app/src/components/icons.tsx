/**
 * Chunky, filled, multi-colour navigation + stat icons for the app shell
 * (product-owner direction D-020: "filled shapes with 2–3 colours each, NOT
 * thin outlines"). All decorative — every icon is paired with a visible or
 * screen-reader text label in the nav, so `aria-hidden` is correct here.
 */

type IconProps = { className?: string };
const box = (className?: string) => ({
  viewBox: "0 0 24 24",
  className: className ?? "h-8 w-8",
  "aria-hidden": true as const,
});

/* --- primary navigation --- */

export function LearnIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M12 2.6 2.6 10.2a1 1 0 0 0 .63 1.78H4.6V20a1 1 0 0 0 1 1h12.8a1 1 0 0 0 1-1v-8.02h1.37a1 1 0 0 0 .63-1.78L12 2.6Z" fill="#58cc02" />
      <path d="M12 5.4 6 10.2V19h12v-8.8L12 5.4Z" fill="#7ed957" />
      <rect x="10" y="13.5" width="4" height="5.5" rx="0.8" fill="#ffc800" />
    </svg>
  );
}

export function QuestsIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M12 2.5 4.5 5.2v6c0 4.3 3.1 7.4 7.5 8.8 4.4-1.4 7.5-4.5 7.5-8.8v-6L12 2.5Z" fill="#ffc800" />
      <path d="M12 4.7 6.5 6.6v4.6c0 3.2 2.2 5.6 5.5 6.8 3.3-1.2 5.5-3.6 5.5-6.8V6.6L12 4.7Z" fill="#ffd84d" />
      <path d="m9 11.4 2.1 2.1L15 9.6" fill="none" stroke="#58cc02" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function ShopIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M5 8h14l-1 11.4a1.2 1.2 0 0 1-1.2 1.1H7.2A1.2 1.2 0 0 1 6 19.4L5 8Z" fill="#2fc7c9" />
      <path d="M6.5 8h11l-.9 10.6H7.4L6.5 8Z" fill="#5fdbdd" />
      <path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2" fill="none" stroke="#1c8f91" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16.5" cy="7.5" r="2.4" fill="#ff4b4b" />
    </svg>
  );
}

export function ProfileIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <circle cx="12" cy="12" r="9.5" fill="#1cb0f6" />
      <circle cx="12" cy="9.4" r="3.4" fill="#eaf7ff" />
      <path d="M5.6 19.4a6.6 6.6 0 0 1 12.8 0A9.4 9.4 0 0 1 12 21.5a9.4 9.4 0 0 1-6.4-2.1Z" fill="#eaf7ff" />
    </svg>
  );
}

export function TeachIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M12 4 2.5 8.2 12 12.4l9.5-4.2L12 4Z" fill="#ffc800" />
      <path d="M6.5 11v4.2c0 1.6 2.5 2.9 5.5 2.9s5.5-1.3 5.5-2.9V11L12 13.6 6.5 11Z" fill="#ffd84d" />
      <path d="M21 8.2v5.1" fill="none" stroke="#ff4b4b" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="21" cy="14" r="1.4" fill="#ff4b4b" />
    </svg>
  );
}

/* --- secondary ("More") navigation --- */

export function ReviewIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <circle cx="12" cy="12" r="9.5" fill="#1cb0f6" />
      <path d="M12 6.5v5.6l3.6 2.1" fill="none" stroke="#eaf7ff" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M17.8 5.2v3.4h-3.4" fill="none" stroke="#0f7fbf" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function LabsIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M10 3h4v1.6h-1V9l4.4 8a2 2 0 0 1-1.8 3H8.4a2 2 0 0 1-1.8-3L11 9V4.6h-1V3Z" fill="#2fc7c9" />
      <path d="M9 14.5h6l2.2 4a1 1 0 0 1-.9 1.5H7.7a1 1 0 0 1-.9-1.5l2.2-4Z" fill="#58cc02" />
      <circle cx="11" cy="17.5" r="1" fill="#eafff2" />
      <circle cx="13.6" cy="18.6" r="0.8" fill="#eafff2" />
    </svg>
  );
}

export function BankIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <rect x="5" y="7" width="14" height="13" rx="2.4" fill="#1cb0f6" />
      <rect x="7.5" y="4.2" width="11" height="12" rx="2.2" fill="#5fc8fa" />
      <path d="M11 8.6a2 2 0 1 1 2.4 2c-.7.3-.9.6-.9 1.3" fill="none" stroke="#0f6fa8" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12.4" cy="14.2" r="1" fill="#0f6fa8" />
    </svg>
  );
}

export function ExamIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M6 3v18" fill="none" stroke="#8aa0ab" strokeWidth="2" strokeLinecap="round" />
      <path d="M6.8 4h10.5l-2.3 3.7L17.3 12H6.8V4Z" fill="#ff4b4b" />
      <path d="M6.8 5.4h7.4l-1.5 2.4 1.6 2.5H6.8V5.4Z" fill="#ff7a7a" />
    </svg>
  );
}

export function MoreIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <circle cx="6" cy="12" r="2.1" fill="#b3c2cd" />
      <circle cx="12" cy="12" r="2.1" fill="#b3c2cd" />
      <circle cx="18" cy="12" r="2.1" fill="#b3c2cd" />
    </svg>
  );
}

/* --- stat strip --- */

export function FlameIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-6 w-6"} aria-hidden>
      <path d="M12 2.2c.6 3-1 4.6-2.6 6.2C7.7 10 6.5 11.8 6.5 14.3A5.5 5.5 0 0 0 17.5 15c0-2-.9-3.4-2-4.7.2 1-.3 1.9-1 2.5.4-2.9-.7-5.6-2.5-7.3 0 0 .8-1.6 0-3.3Z" fill="#ff9600" />
      <path d="M12.2 9.4c1.1 1.1 1.9 2.4 1.9 3.9a2.2 2.2 0 0 1-4.4.2c0-1.3.8-2.2 1.6-3 .5-.5.9-.9.9-1.1Z" fill="#ffc800" />
    </svg>
  );
}

export function GemIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-6 w-6"} aria-hidden>
      <path d="M7 3.4h10l4 5.2-9 12-9-12 4-5.2Z" fill="#1cb0f6" />
      <path d="M7 3.4 5.2 8.6h13.6L17 3.4H7Z" fill="#7ed4fb" />
      <path d="M5.2 8.6 12 20.6l6.8-12H5.2Z" fill="#1cb0f6" />
      <path d="M9.4 8.6 12 20.6l2.6-12H9.4Z" fill="#4cc2ff" />
    </svg>
  );
}

export function HeartIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" className={className ?? "h-6 w-6"} aria-hidden>
      <path d="M12 20.5 4.4 13a4.6 4.6 0 0 1 6.5-6.5l1.1 1.1 1.1-1.1A4.6 4.6 0 0 1 19.6 13L12 20.5Z" fill="#ff4b4b" />
      <path d="M8.2 8.1a2.6 2.6 0 0 0-1.9 3.1" fill="none" stroke="#ff8f8f" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
