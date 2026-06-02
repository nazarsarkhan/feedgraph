/**
 * Absolute-time display in the viewer's own timezone.
 *
 * Relative timestamps ("3 minutes ago") answer "how fresh", but the
 * hover/title tooltips need an absolute instant. They used to carry the raw
 * UTC ISO string, which is unfriendly to a reviewer in a non-UTC zone. These
 * helpers format the same instant in whatever timezone the browser reports
 * via `Intl.DateTimeFormat().resolvedOptions().timeZone` — no extra
 * dependency, no profile setting to wire.
 */

/** The viewer's IANA timezone (e.g. "Europe/Berlin"), or 'UTC' if unknown. */
export function getUserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    // resolvedOptions().timeZone is universally supported, but guard anyway
    // so a locked-down runtime never throws on a tooltip.
    return 'UTC';
  }
}

// Built once per process — constructing an Intl.DateTimeFormat is not free and
// every list row asks for a tooltip. Locale is left undefined so the browser
// picks the viewer's; timeZone defaults to the resolved local zone. Explicit
// component options (not dateStyle/timeStyle) because the spec forbids
// combining those shorthands with timeZoneName.
const absoluteFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  timeZoneName: 'short',
});

/**
 * Format an ISO timestamp as a local-time string with the timezone
 * abbreviation, e.g. "May 29, 2026, 4:12 PM GMT+2". Returns the input
 * untouched if it isn't a parseable date, so a bad value can never blank a
 * tooltip or throw.
 */
export function formatAbsolute(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return absoluteFormatter.format(date);
}
