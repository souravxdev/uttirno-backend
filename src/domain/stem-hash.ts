import { createHash } from 'node:crypto';

/**
 * Dedupe key for question stems: NFC-normalized (Bangla has multiple
 * codepoint compositions for the same glyphs), whitespace-collapsed,
 * lowercased, sha256-hexed. Every question write path must set
 * Question.stemHash with this — the DB unique constraint is the hard
 * guarantee that re-importing past papers never duplicates.
 */
export function normalizeStem(stem: string): string {
  return stem.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase();
}

export function stemHash(stem: string): string {
  return createHash('sha256').update(normalizeStem(stem), 'utf8').digest('hex');
}
