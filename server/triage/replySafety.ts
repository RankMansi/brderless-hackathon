/**
 * Last line of defense at the store boundary. The prompt must not contain
 * internal notes; if a model reply still repeats one, do not persist it.
 */
export function findLeakedInternalNote(reply: string, notes: string[]): string | null {
  const haystack = reply.toLowerCase();
  for (const note of notes) {
    const needle = note.trim().toLowerCase();
    if (needle.length < 12) continue;
    if (haystack.includes(needle)) return note;
  }
  return null;
}
