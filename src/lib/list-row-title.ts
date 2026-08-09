/** Client-safe ON PURPOSE. src/lib/whatsapp.ts opens with `import crypto from
 *  'node:crypto'`, so a 'use client' component importing the truncation from
 *  there would pull a Node builtin into the browser bundle.
 *
 *  The panel's preview and the sender MUST compute the cut with the same
 *  function: a preview that drifts from what members actually receive is worse
 *  than no preview, because she would trust it. So the function lives here and
 *  whatsapp.ts re-exports it — one definition, two callers. */

/** WhatsApp interactive-list row titles cap at 24 UTF-16 code units. Counted in
 *  code units, not characters: ⛪ costs 1, 🙏 costs 2. */
export const LIST_ROW_TITLE_MAX = 24;

/** Truncates a row title to at most LIST_ROW_TITLE_MAX UTF-16 code units without
 *  splitting a grapheme cluster (e.g. a surrogate-pair emoji or an emoji +
 *  variation selector). Menu labels in this project routinely start with an
 *  emoji, so a naive `.slice()` can cut a glyph in half and render a broken
 *  character in the chat. */
export function truncateRowTitle(label: string): string {
  if (label.length <= LIST_ROW_TITLE_MAX) return label;

  const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
  let result = '';
  for (const { segment } of segmenter.segment(label)) {
    if (result.length + segment.length > LIST_ROW_TITLE_MAX) break;
    result += segment;
  }
  return result;
}
