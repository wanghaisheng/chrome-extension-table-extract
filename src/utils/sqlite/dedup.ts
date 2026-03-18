export type DedupMode = 'identical_to_last';

// Simple, fast, deterministic hash for dedup decisions.
// Not cryptographic; only used to avoid storing repeated identical payloads.
export function fnv1a32(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV-1a multiply: hash *= 16777619
    hash = (hash + (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

function normalizeCell(v: string | null | undefined): string {
  // Normalize benign formatting diffs:
  // - trim surrounding whitespace
  // - collapse internal whitespace runs
  // - normalize line endings
  const s = String(v ?? '');
  return s.replace(/\r\n/g, '\n').trim().replace(/\s+/g, ' ');
}

export function computeExtractionContentHash(table: string[][]): string {
  // Assumes row 0 is header; schema is already derived from headers.
  // Hash only data rows.
  const rows = table.slice(1);
  let acc = '';
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] ?? [];
    for (let c = 0; c < row.length; c++) {
      if (r || c) acc += '\u001f';
      acc += normalizeCell(row[c]);
    }
    acc += '\u001e';
  }
  return fnv1a32(acc);
}

export function shouldSkipStoreByLastHash(mode: DedupMode, lastHash: string | null, newHash: string): boolean {
  if (mode !== 'identical_to_last') return false;
  if (!lastHash) return false;
  return lastHash === newHash;
}

