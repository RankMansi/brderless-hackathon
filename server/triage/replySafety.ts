/**
 * Last line of defense at the store boundary. The prompt must not contain
 * internal notes; if a model reply still repeats one, do not persist it.
 */
export function findLeakedInternalNote(reply: string, notes: string[]): string | null {
  const haystack = reply.toLowerCase();
  for (const note of notes) {
    const needle = note.trim().toLowerCase();
    if (needle.length >= 12 && haystack.includes(needle)) return note;

    // Models often copy only the most sensitive sentence or identifier rather than a whole note.
    const fragments = note
      .split(/[.!?;\n]+/)
      .map((fragment) => fragment.trim().toLowerCase())
      .filter((fragment) => fragment.length >= 12);
    const identifiers = note.match(/\b[A-Z]{2,}(?:-[A-Z0-9]+)+\b/gi) ?? [];
    if (
      fragments.some((fragment) => haystack.includes(fragment)) ||
      identifiers.some((identifier) => haystack.includes(identifier.toLowerCase()))
    ) {
      return note;
    }
  }
  return null;
}
