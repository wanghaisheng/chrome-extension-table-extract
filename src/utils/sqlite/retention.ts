export type ExtractionKey = {
  id: number;
  domain: string;
  extractedAt: number;
};

/**
 * Decide which extraction ids should be deleted to keep at most `keepLastPerDomain`
 * per domain. Deterministic: newest first by (extractedAt desc, id desc).
 */
export function computeExtractionIdsToDeleteKeepLastPerDomain(
  items: ExtractionKey[],
  keepLastPerDomain: number,
): number[] {
  const keepN = Math.max(0, Math.floor(keepLastPerDomain));
  if (keepN === 0) return items.map((i) => i.id);

  const byDomain: Record<string, ExtractionKey[]> = {};
  for (const it of items) {
    const d = it.domain ?? '';
    byDomain[d] = byDomain[d] ?? [];
    byDomain[d].push(it);
  }

  const toDelete: number[] = [];
  for (const d of Object.keys(byDomain)) {
    const sorted = byDomain[d].slice().sort((a, b) => {
      const t = (b.extractedAt ?? 0) - (a.extractedAt ?? 0);
      if (t !== 0) return t;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    const drop = sorted.slice(keepN);
    for (const it of drop) toDelete.push(it.id);
  }

  // Stable output for tests/logging.
  return toDelete.sort((a, b) => a - b);
}

