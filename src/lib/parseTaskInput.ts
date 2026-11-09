/**
 * Splits pasted/typed input into one task title per line.
 *
 * Splits on (in priority order):
 *   - newlines (\r\n or \n)
 *   - tabs
 *   - semicolons
 *   - commas, but ONLY if no newlines exist AND there are at least 2 commas
 *     (so "buy 1, 2, 3 apples" stays as one task on its own, but
 *     "WEBASSIGN, MMAI, reply to roderick" splits into three).
 *
 * Strips common list prefixes after split (per line):
 *   - [ ] / [x] / [X] / []   (markdown checkboxes, both states added as open)
 *   - / * / +                  (bullets)
 *   - 1. / 2) / 10.           (numbered)
 *   - • / →                    (unicode bullets/arrows)
 *   - "todo:" / "task:"        (label prefixes)
 */
export function parseTaskInput(raw: string): string[] {
  if (!raw) return [];

  // Stage 1: primary split (newlines, tabs, semicolons).
  let segments = raw.split(/\r?\n|\t|;/);

  // Stage 2: comma split — only when there are no newlines AND multiple commas
  // (avoids breaking up titles that legitimately contain a comma).
  if (segments.length === 1) {
    const commaCount = (raw.match(/,/g) ?? []).length;
    if (commaCount >= 2) {
      segments = raw.split(/,/);
    }
  }

  return segments
    .map(stripPrefix)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

const PREFIX_RE = new RegExp(
  '^\\s*(?:' +
    // checkboxes with optional bullet: "- [ ]", "* [x]", "[]", "[ ]", "[x]"
    '[-*+]?\\s*\\[[ xX]?\\]\\s+|' +
    // plain bullets
    '[-*+]\\s+|' +
    // numbered: "1.", "10)", "2 -"
    '\\d+[.)]\\s+|' +
    // unicode bullets / arrows
    '[•◦▪→»]\\s+|' +
    // label prefixes (case-insensitive handled below)
    '(?:todo|task|item)\\s*:\\s*' +
    ')',
  'i',
);

function stripPrefix(line: string): string {
  return line.replace(PREFIX_RE, '');
}
