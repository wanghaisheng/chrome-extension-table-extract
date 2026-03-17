function escapeCsvCell(value: string): string {
  const v = value ?? '';
  if (v.includes('"') || v.includes(',') || v.includes('\n') || v.includes('\r')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export function toTSV(table: string[][]): string {
  return (table ?? []).map((row) => (row ?? []).map((c) => String(c ?? '')).join('\t')).join('\n');
}

export function toCSV(table: string[][]): string {
  return (table ?? [])
    .map((row) => (row ?? []).map((c) => escapeCsvCell(String(c ?? ''))).join(','))
    .join('\n');
}

export function toJSON(table: string[][]): string {
  const headers = (table?.[0] ?? []).map((h) => String(h ?? ''));
  const rows = (table ?? []).slice(1);
  const objs = rows.map((row) => {
    const o: Record<string, string> = {};
    for (let i = 0; i < Math.max(headers.length, row.length); i++) {
      const key = headers[i] ?? `col_${i}`;
      o[key] = String(row[i] ?? '');
    }
    return o;
  });
  return JSON.stringify({ headers, rows: objs }, null, 2);
}

