type ParsedNumber = { ok: true; value: number } | { ok: false };

function parseFirstNumber(value: string | null | undefined): ParsedNumber {
  const s = String(value ?? '').trim();
  if (!s) return { ok: false };
  const match = /-?\d+(?:\.\d+)?/.exec(s);
  if (!match) return { ok: false };
  const n = Number(match[0]);
  if (!Number.isFinite(n)) return { ok: false };
  return { ok: true, value: n };
}

function normalizeHeader(h: string): string {
  return String(h ?? '').trim().toLowerCase();
}

const HEADER_SYNONYMS = new Set([
  '序号',
  '编号',
  '序',
  'no',
  '#',
  'index',
]);

export function detectSeqLikeColumnIndex(headers: string[], rows: string[][], minParseableRatio = 0.8): number | null {
  if (!Array.isArray(headers) || headers.length === 0) return null;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const candidates: number[] = [];
  for (let i = 0; i < headers.length; i++) {
    const nh = normalizeHeader(headers[i] ?? '');
    if (nh === '' || HEADER_SYNONYMS.has(nh)) candidates.push(i);
  }
  if (candidates.length === 0) return null;

  const sampleSize = Math.min(rows.length, 500);
  let bestIdx: number | null = null;
  let bestRatio = 0;

  for (const idx of candidates) {
    let ok = 0;
    for (let r = 0; r < sampleSize; r++) {
      const row = rows[r] ?? [];
      const parsed = parseFirstNumber(row[idx]);
      if (parsed.ok) ok++;
    }
    const ratio = ok / sampleSize;
    if (ratio > bestRatio) {
      bestRatio = ratio;
      bestIdx = idx;
    }
  }

  if (bestIdx == null) return null;
  return bestRatio >= minParseableRatio ? bestIdx : null;
}

export function sortMergedRowsBySeqLikeColumn(
  merged: string[][],
  minParseableRatio = 0.8,
): { table: string[][]; sortedBySeq: boolean } {
  const headers = merged?.[0] ?? [];
  const rows = (merged ?? []).slice(1);
  if (headers.length === 0 || rows.length === 0) return { table: merged, sortedBySeq: false };

  const seqCol = detectSeqLikeColumnIndex(headers, rows, minParseableRatio);
  if (seqCol == null) return { table: merged, sortedBySeq: false };

  const extractedAtCol = headers.findIndex((h) => normalizeHeader(h) === 'extracted_at');
  const decorated = rows.map((row, i) => {
    const seq = parseFirstNumber((row ?? [])[seqCol]);
    const extractedAt =
      extractedAtCol >= 0 ? parseFirstNumber((row ?? [])[extractedAtCol]) : ({ ok: false } as const);
    return {
      row,
      i,
      seq: seq.ok ? seq.value : null,
      extractedAt: extractedAt.ok ? extractedAt.value : null,
    };
  });

  decorated.sort((a, b) => {
    const aMissing = a.seq == null;
    const bMissing = b.seq == null;
    if (aMissing !== bMissing) return aMissing ? 1 : -1;
    if (a.seq != null && b.seq != null && a.seq !== b.seq) return a.seq - b.seq;
    if (a.extractedAt != null && b.extractedAt != null && a.extractedAt !== b.extractedAt) return a.extractedAt - b.extractedAt;
    return a.i - b.i;
  });

  return { table: [headers, ...decorated.map((d) => d.row)], sortedBySeq: true };
}

