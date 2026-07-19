/**
 * Chunky, filled, multi-colour icons for the class-analytics dashboard
 * (matches the app-shell icon language in `@/components/icons`: 24x24
 * viewBox, 2-3 flat fills, no thin outlines — product-owner direction D-020).
 * Every icon here is decorative (aria-hidden) and always paired with a
 * visible text label, never used as the sole carrier of meaning.
 */

type IconProps = { className?: string };
const box = (className?: string) => ({
  viewBox: "0 0 24 24",
  className: className ?? "h-7 w-7",
  "aria-hidden": true as const,
});

/** Summary tile: students enrolled. */
export function RosterIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <circle cx="9" cy="8.2" r="3.4" fill="#1cb0f6" />
      <circle cx="16.3" cy="9.4" r="2.6" fill="#5fc8fa" />
      <path d="M3.2 19.4a5.9 5.9 0 0 1 11.6 0 10 10 0 0 1-11.6 0Z" fill="#1cb0f6" />
      <path d="M13.6 14.3a4.7 4.7 0 0 1 7 4.1 8.4 8.4 0 0 1-4.2 1.6 6.9 6.9 0 0 0-2.8-5.7Z" fill="#5fc8fa" />
    </svg>
  );
}

/** Summary tile / tier icon: struggling. */
export function StrugglingIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M12 2.8 22 20.8H2L12 2.8Z" fill="#ff4b4b" />
      <path d="M12 5.6 19.2 18.4H4.8L12 5.6Z" fill="#ff7a7a" />
      <rect x="10.9" y="9.4" width="2.2" height="5.4" rx="1" fill="#fff5f5" />
      <circle cx="12" cy="16.6" r="1.2" fill="#fff5f5" />
    </svg>
  );
}

/** Summary tile / tier icon: healthy / on track. */
export function HealthyIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M12 2.5 20 5.6v5.6c0 5-3.3 8.3-8 10.3-4.7-2-8-5.3-8-10.3V5.6L12 2.5Z" fill="#58cc02" />
      <path d="M12 4.6 18 6.9v4.3c0 4-2.6 6.6-6 8.2-3.4-1.6-6-4.2-6-8.2V6.9L12 4.6Z" fill="#7ed957" />
      <path d="m8.4 12.1 2.4 2.4 4.8-4.9" fill="none" stroke="#eafff2" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Tier icon: not started yet (neutral). */
export function NotStartedIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M6 3h12v2.4l-4.4 6.6L18 18.6V21H6v-2.4l4.4-6.6L6 5.4V3Z" fill="#8aa0ab" />
      <path d="M7.6 4.6h8.8l-3.7 5.5h-1.4L7.6 4.6Z" fill="#b3c2cd" />
      <path d="M7.6 19.4 11.3 14h1.4l3.7 5.4H7.6Z" fill="#b3c2cd" />
    </svg>
  );
}

/** Section header icon: reteach / priority flag. */
export function FlagIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path d="M6.5 3v18" fill="none" stroke="#8aa0ab" strokeWidth="2" strokeLinecap="round" />
      <path d="M7.3 4h10.4l-2.3 3.6L17.7 11.2H7.3V4Z" fill="#ffc800" />
      <path d="M7.3 5.4h7.3l-1.5 2.2 1.5 2.2H7.3V5.4Z" fill="#ffe37a" />
    </svg>
  );
}

/** Section header icon: student spread (distribution bars). */
export function SpreadIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <rect x="3" y="13" width="5" height="8" rx="1.4" fill="#1cb0f6" />
      <rect x="9.5" y="8" width="5" height="13" rx="1.4" fill="#58cc02" />
      <rect x="16" y="3" width="5" height="18" rx="1.4" fill="#ff4b4b" />
    </svg>
  );
}

/** Section header icon: mastery dimensions. */
export function DimensionsIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <circle cx="12" cy="12" r="9.5" fill="#2fc7c9" />
      <path d="M12 12 12 4.6" fill="none" stroke="#eafcfc" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12 18 15.8" fill="none" stroke="#eafcfc" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 12 6.4 15.6" fill="none" stroke="#eafcfc" strokeWidth="2" strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.8" fill="#eafcfc" />
    </svg>
  );
}

/** Course switcher icon: sections. */
export function SectionsIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <rect x="3.5" y="5" width="17" height="4.2" rx="1.3" fill="#1cb0f6" />
      <rect x="3.5" y="10.6" width="17" height="4.2" rx="1.3" fill="#58cc02" />
      <rect x="3.5" y="16.2" width="17" height="4.2" rx="1.3" fill="#ffc800" />
    </svg>
  );
}

/** Cloud-offline icon for the honest degrade state. */
export function CloudOfflineIcon({ className }: IconProps) {
  return (
    <svg {...box(className)}>
      <path
        d="M7.5 18a4.3 4.3 0 0 1-.7-8.5A5.4 5.4 0 0 1 17.3 8.9a3.9 3.9 0 0 1-.6 9.1H7.5Z"
        fill="#52656f"
      />
      <path d="M4.4 4.4 19.6 19.6" fill="none" stroke="#ff8080" strokeWidth="2.1" strokeLinecap="round" />
    </svg>
  );
}
