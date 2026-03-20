export async function scrapStructuredTables() {
  // NOTE: This function is injected via chrome.scripting.executeScript.
  // Keep it self-contained: do not rely on module-level helpers/closures.
  type Row = string[];
  type Table = Row[];

  function cleanText(text: string): string {
    return (text || '').replaceAll('\n', ' ').replaceAll('\t', ' ').replace(/\s+/g, ' ').trim();
  }

  function removeEmptyColumns(table: Table): Table {
    const keep = (table[0] || []).map((_, idx) => table.some((row) => Boolean(row[idx] && row[idx].trim() !== '')));
    return table.map((row) => row.filter((_, idx) => keep[idx]));
  }

  function titleFor(element: Element): string {
    const aria = cleanText(element.getAttribute('aria-label') ?? '');
    if (aria) return aria;

    let title = cleanText((element.previousElementSibling as HTMLElement | null)?.innerText ?? '');
    let current: Element | null = element;
    let safety = 0;

    while ((title === '' || title.startsWith('.')) && current && safety++ < 50) {
      const heading = current.querySelector('caption,h6,h5,h4,h3,h2,h1,title,[aria-label]') as HTMLElement | null;
      if (heading) {
        const t = cleanText((heading.getAttribute?.('aria-label') ?? '') || heading.innerText || '');
        if (t) title = t;
      }
      current = current.parentElement;
    }

    return title;
  }

  function extractAriaRoleTable(root: Element): Table {
    const rows = Array.from(root.querySelectorAll('[role="row"]'));
    if (rows.length === 0) return [];

    const table = rows
      .map((row) => {
        const cells = Array.from(
          row.querySelectorAll('[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]')
        ) as HTMLElement[];
        return cells.map((c) => cleanText(c.innerText ?? ''));
      })
      .filter((r) => r.length > 0);

    return removeEmptyColumns(table);
  }

  function extractDefinitionList(dl: Element): Table {
    const dts = Array.from(dl.querySelectorAll(':scope > dt')) as HTMLElement[];
    const dds = Array.from(dl.querySelectorAll(':scope > dd')) as HTMLElement[];
    if (dts.length === 0 || dds.length === 0) return [];

    const n = Math.min(dts.length, dds.length);
    const table: Table = [['Key', 'Value']];
    for (let i = 0; i < n; i++) {
      table.push([cleanText(dts[i]?.innerText ?? ''), cleanText(dds[i]?.innerText ?? '')]);
    }
    return removeEmptyColumns(table);
  }

  function extractListLike(ul: Element): Table {
    const items = Array.from(ul.querySelectorAll(':scope > li')) as HTMLElement[];
    if (items.length < 5) return [];

    const rows = items
      .slice(0, 200)
      .map((li) => {
        const children = Array.from(li.children) as HTMLElement[];
        const childTexts = children
          .map((c) => cleanText(c.innerText ?? ''))
          .filter((t) => t !== '');

        if (childTexts.length >= 2) return childTexts.slice(0, 24);

        const text = cleanText(li.innerText ?? '');
        if (!text) return [];

        // Conservative split: prefer tabs, then 2+ spaces.
        if (text.includes('\t')) {
          const parts = text.split('\t').map(cleanText).filter(Boolean);
          return parts.length >= 2 ? parts.slice(0, 24) : [text];
        }

        const parts = text.split(/\s{2,}/g).map(cleanText).filter(Boolean);
        return parts.length >= 2 ? parts.slice(0, 24) : [text];
      })
      .filter((r) => r.length > 0);

    const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    if (maxCols <= 0) return [];
    // Avoid treating navigation/filter lists as data tables.
    if (maxCols < 2) return [];

    // Pad to rectangular.
    const padded = rows.map((r) => (r.length === maxCols ? r : [...r, ...Array(maxCols - r.length).fill('')]));
    return removeEmptyColumns(padded);
  }

  function extractRepeatingCards(): Array<{ title: string; table: Table; includeHeader: boolean }> {
    type Candidate = { key: string; elements: HTMLElement[] };

    const all = Array.from(document.querySelectorAll('article,li,div')) as HTMLElement[];
    const buckets = new Map<string, HTMLElement[]>();

    for (const el of all) {
      const cls = (el.className || '').toString().trim();
      const firstClass = cls.split(/\s+/g).filter(Boolean)[0] ?? '';
      const key = `${el.tagName.toLowerCase()}.${firstClass || '_'}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(el);
    }

    const candidates: Candidate[] = Array.from(buckets.entries())
      .map(([key, elements]) => ({ key, elements }))
      .filter((c) => c.elements.length >= 5 && c.elements.length <= 200)
      // Prefer more specific (has a class) and more items.
      .sort((a, b) => {
        const aHasClass = a.key.includes('._') ? 0 : 1;
        const bHasClass = b.key.includes('._') ? 0 : 1;
        return (bHasClass - aHasClass) || (b.elements.length - a.elements.length);
      })
      .slice(0, 6);

    const out: Array<{ title: string; table: Table; includeHeader: boolean }> = [];

    for (const cand of candidates) {
      const items = cand.elements;

      // Find stable class-based fields across items (e.g. "docsum-authors", "docsum-pmid").
      const fieldCounts = new Map<string, number>();
      const fieldSamples = new Map<string, { totalLen: number; n: number }>();

      for (const item of items) {
        const seen = new Set<string>();
        const descendants = Array.from(item.querySelectorAll('[class]')) as HTMLElement[];
        for (const d of descendants) {
          const cls = (d.className || '').toString().trim();
          const first = cls.split(/\s+/g).filter(Boolean)[0];
          if (!first) continue;
          const t = cleanText(d.innerText ?? '');
          if (!t) continue;
          if (t.length > 220) continue;
          if (seen.has(first)) continue;
          seen.add(first);
          fieldCounts.set(first, (fieldCounts.get(first) ?? 0) + 1);
          const sample = fieldSamples.get(first) ?? { totalLen: 0, n: 0 };
          sample.totalLen += t.length;
          sample.n += 1;
          fieldSamples.set(first, sample);
        }
      }

      const minHit = Math.ceil(items.length * 0.8);
      const stableFields = Array.from(fieldCounts.entries())
        .filter(([k, v]) => v >= minHit && k.length <= 48)
        .map(([k]) => {
          const s = fieldSamples.get(k)!;
          return { k, avgLen: s.totalLen / Math.max(1, s.n) };
        })
        .filter((x) => x.avgLen >= 3 && x.avgLen <= 140)
        .sort((a, b) => a.avgLen - b.avgLen)
        .slice(0, 6)
        .map((x) => x.k);

      // Require at least one meaningful stable field or a stable title link.
      const header: string[] = [];
      header.push('Title', 'Link');
      for (const f of stableFields) header.push(f);

      const rows: Table = [header];
      let nonEmptyRows = 0;

      for (const item of items) {
        const titleAnchor =
          (item.querySelector('h3 a[href]') as HTMLAnchorElement | null) ??
          (item.querySelector('.gs_rt a[href]') as HTMLAnchorElement | null) ??
          (item.querySelector('a[href][id]') as HTMLAnchorElement | null) ??
          (item.querySelector('a[href]') as HTMLAnchorElement | null);

        const title = cleanText(titleAnchor?.innerText ?? '');
        const link = titleAnchor?.href ?? '';

        const cells: string[] = [title, link];
        for (const f of stableFields) {
          const el = item.querySelector(`.${CSS.escape(f)}`) as HTMLElement | null;
          cells.push(cleanText(el?.innerText ?? ''));
        }

        if (cells.some((c) => c && c.trim() !== '')) nonEmptyRows += 1;
        rows.push(cells);
      }

      const table = removeEmptyColumns(rows);
      const cols = table[0]?.length ?? 0;
      if (nonEmptyRows < 5) continue;
      if (cols < 2) continue;

      // Title based on the candidate key.
      out.push({ title: cand.key, table, includeHeader: true });
    }

    return out;
  }

  const results: Array<{ title: string; table: Table; includeHeader: boolean }> = [];

  // 1) ARIA role-based tables/grids (common in modern apps).
  const ariaTables = Array.from(document.querySelectorAll('[role="table"],[role="grid"],[role="treegrid"]'));
  for (const el of ariaTables) {
    const table = extractAriaRoleTable(el);
    if (table.length < 2 || (table[0] ?? []).length < 2) continue;
    if (table.every((row) => row.every((c) => c === ''))) continue;
    results.push({ title: titleFor(el), table, includeHeader: true });
  }

  // 2) Definition lists.
  const dls = Array.from(document.querySelectorAll('dl'));
  for (const dl of dls) {
    const table = extractDefinitionList(dl);
    if (table.length < 2) continue;
    results.push({ title: titleFor(dl), table, includeHeader: true });
  }

  // 3) List items that behave like rows.
  const lists = Array.from(document.querySelectorAll('ul,ol'));
  for (const list of lists) {
    const table = extractListLike(list);
    if (table.length < 5) continue;
    results.push({ title: titleFor(list), table, includeHeader: false });
  }

  // 4) Repeating "card" items (article/div/li lists).
  // Only attempt if earlier structured sources didn't find anything substantial.
  if (results.length === 0) {
    results.push(...extractRepeatingCards());
  }

  // Prefer the most table-like results first (more columns, more rows).
  results.sort((a, b) => (b.table[0]?.length ?? 0) - (a.table[0]?.length ?? 0) || (b.table.length - a.table.length));

  return results.slice(0, 5);
}
