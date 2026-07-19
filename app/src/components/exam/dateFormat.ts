/**
 * Date display helpers for the exam plan (Wave 2 Stream N, D-020 restyle).
 *
 * `plan.examDateISO` and every `ReviewItem.dueAt` are UTC instants (the exam
 * date input round-trips through `new Date(dateInputValue).toISOString()`,
 * and the scheduler buckets days with `scheduler.isoDate`, which is also
 * UTC). Formatting with `timeZone: "UTC"` keeps every displayed date in sync
 * with the engine's own notion of "day" — without it, `toLocaleDateString`
 * would convert to the browser's local zone and could show the wrong
 * calendar day (an off-by-one the original flat UI avoided by never
 * round-tripping through `Date` display formatting at all).
 */

const FULL: Intl.DateTimeFormatOptions = {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
};

const SHORT: Intl.DateTimeFormatOptions = {
  weekday: "short",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
};

/** "Wednesday, August 5, 2026" — for the countdown header. */
export function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, FULL);
}

/** "Wed, Aug 5" — for timeline day-group headings. Accepts a full ISO
 * timestamp or a bare "YYYY-MM-DD" day key (both parse as UTC midnight). */
export function formatShortDate(isoOrDayKey: string): string {
  return new Date(isoOrDayKey).toLocaleDateString(undefined, SHORT);
}
