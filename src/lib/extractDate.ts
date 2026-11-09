import * as chrono from 'chrono-node';

/**
 * Pulls a natural-language date out of a task title.
 *
 * "WEBASSIGN friday" → { cleanTitle: "WEBASSIGN", due_at: <Friday at 09:00> }
 * "Math review 30 pages" → { cleanTitle: "Math review 30 pages", due_at: null }
 *
 * - Future-biased so "friday" means upcoming Friday, not last Friday.
 * - Strips the matched date phrase from the title so it doesn't double-render in the UI.
 * - Returns ISO string (UTC) for due_at; pass to Supabase as-is.
 */
export function extractDate(
  rawTitle: string,
  refDate: Date = new Date(),
): { cleanTitle: string; due_at: string | null } {
  const results = chrono.parse(rawTitle, refDate, { forwardDate: true });
  if (results.length === 0) {
    return { cleanTitle: rawTitle.trim(), due_at: null };
  }
  const first = results[0];
  const date = first.start.date();
  if (!first.start.isCertain('hour')) {
    date.setHours(9, 0, 0, 0);
  }
  const cleanTitle = (rawTitle.slice(0, first.index) + rawTitle.slice(first.index + first.text.length))
    .replace(/\s+/g, ' ')
    .trim();
  return {
    cleanTitle: cleanTitle || rawTitle.trim(),
    due_at: date.toISOString(),
  };
}
