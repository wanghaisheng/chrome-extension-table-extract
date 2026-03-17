import SQLiteESMFactory from 'wa-sqlite/dist/wa-sqlite-async.mjs';
import * as SQLite from 'wa-sqlite';
import { IDBMinimalVFS } from 'wa-sqlite/src/examples/IDBMinimalVFS.js';

import { SQLiteExtractPayload } from './types';
import { computeExtractionIdsToDeleteKeepLastPerDomain } from './retention';

type SQLiteApi = ReturnType<typeof SQLite.Factory>;

let SQLITE_PROMISE: Promise<{ sqlite3: SQLiteApi; db: number }> | null = null;
let WRITE_LOCK: Promise<void> = Promise.resolve();

async function withWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = WRITE_LOCK;
  let release!: () => void;
  WRITE_LOCK = new Promise<void>((r) => (release = r));
  await prev;
  try {
    return await fn();
  } finally {
    release();
  }
}

async function run(sqlite3: SQLiteApi, db: number, sql: string, params: any[] = []): Promise<void> {
  await sqlite3.run(db, sql, params);
}

async function execWithParams(sqlite3: SQLiteApi, db: number, sql: string, params: any[] = []): Promise<any> {
  return await sqlite3.execWithParams(db, sql, params);
}

async function getClient(): Promise<{ sqlite3: SQLiteApi; db: number }> {
  if (!SQLITE_PROMISE) {
    SQLITE_PROMISE = (async () => {
      const module = await SQLiteESMFactory();
      const sqlite3 = SQLite.Factory(module as any);

      const vfs = new IDBMinimalVFS('table_extract_idb_vfs');
      sqlite3.vfs_register(vfs as any, true);

      const db = await sqlite3.open_v2('table_extract.db', undefined as any, vfs.name);
      await sqlite3.exec(db, `
        PRAGMA foreign_keys = ON;

        CREATE TABLE IF NOT EXISTS domains (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          domain       TEXT NOT NULL UNIQUE,
          default_name TEXT,
          created_at   INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS schemas (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          domain_id   INTEGER NOT NULL,
          url_pattern TEXT,
          version     INTEGER NOT NULL,
          created_at  INTEGER NOT NULL,
          is_active   INTEGER NOT NULL DEFAULT 1,
          FOREIGN KEY(domain_id) REFERENCES domains(id)
        );

        CREATE TABLE IF NOT EXISTS schema_columns (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          schema_id  INTEGER NOT NULL,
          col_index  INTEGER NOT NULL,
          name       TEXT NOT NULL,
          data_type  TEXT NOT NULL DEFAULT 'text',
          FOREIGN KEY(schema_id) REFERENCES schemas(id),
          UNIQUE(schema_id, col_index)
        );

        CREATE TABLE IF NOT EXISTS extractions (
          id           INTEGER PRIMARY KEY AUTOINCREMENT,
          schema_id    INTEGER NOT NULL,
          url          TEXT NOT NULL,
          page_title   TEXT,
          extracted_at INTEGER NOT NULL,
          row_count    INTEGER NOT NULL,
          FOREIGN KEY(schema_id) REFERENCES schemas(id)
        );

        CREATE TABLE IF NOT EXISTS extraction_cells (
          id            INTEGER PRIMARY KEY AUTOINCREMENT,
          extraction_id INTEGER NOT NULL,
          row_index     INTEGER NOT NULL,
          col_index     INTEGER NOT NULL,
          value         TEXT,
          FOREIGN KEY(extraction_id) REFERENCES extractions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_extraction_row_col
          ON extraction_cells (extraction_id, row_index, col_index);

        -- Migration: url_pattern should be non-null for reliable param binding.
        UPDATE schemas SET url_pattern = '/' WHERE url_pattern IS NULL;
      `);

      return { sqlite3, db };
    })();
  }
  return SQLITE_PROMISE;
}

function nowMs(): number {
  return Date.now();
}

function getHostname(url: string): string {
  return new URL(url).hostname;
}

function getUrlPattern(url: string): string {
  // Heuristic "page type" bucket:
  // - "/products/123" -> "/products"
  // - "/users/1/edit" -> "/users"
  // - shallow paths like "/page-1" -> "/" (avoid per-page buckets)
  try {
    const u = new URL(url);
    const parts = u.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) return `/${parts[0]}`;
    return '/';
  } catch {
    return '/';
  }
}

async function selectFirstInt(sqlite3: SQLiteApi, db: number, sql: string, params?: any[]): Promise<number | null> {
  const res = await execWithParams(sqlite3, db, sql, params ?? []);
  const row = res.rows?.[0];
  if (!row || row[0] == null) return null;
  return Number(row[0]);
}

async function getOrCreateDomainId(sqlite3: SQLiteApi, db: number, domain: string): Promise<number> {
  await run(sqlite3, db, `INSERT OR IGNORE INTO domains (domain, created_at) VALUES (?, ?)`, [domain, nowMs()]);
  const id = await selectFirstInt(sqlite3, db, `SELECT id FROM domains WHERE domain = ?`, [domain]);
  if (!id) throw new Error(`Failed to load domain id for ${domain}`);
  return id;
}

async function getActiveSchemaId(
  sqlite3: SQLiteApi,
  db: number,
  domainId: number,
  urlPattern: string,
): Promise<number | null> {
  return await selectFirstInt(
    sqlite3,
    db,
    `SELECT id FROM schemas WHERE domain_id = ? AND url_pattern = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
    [domainId, urlPattern],
  );
}

async function readSchemaHeaders(sqlite3: SQLiteApi, db: number, schemaId: number): Promise<string[]> {
  const res = await execWithParams(
    sqlite3,
    db,
    `SELECT name FROM schema_columns WHERE schema_id = ? ORDER BY col_index ASC`,
    [schemaId],
  );
  return (res.rows ?? []).map((r: any[]) => String(r[0] ?? ''));
}

async function createSchema(
  sqlite3: SQLiteApi,
  db: number,
  domainId: number,
  urlPattern: string,
  headers: string[],
): Promise<number> {
  const nextVersion =
    (await selectFirstInt(
      sqlite3,
      db,
      `SELECT COALESCE(MAX(version), 0) + 1 FROM schemas WHERE domain_id = ? AND url_pattern = ?`,
      [domainId, urlPattern],
    )) ??
    1;

  await run(sqlite3, db, `UPDATE schemas SET is_active = 0 WHERE domain_id = ? AND url_pattern = ?`, [domainId, urlPattern]);
  await run(
    sqlite3,
    db,
    `INSERT INTO schemas (domain_id, url_pattern, version, created_at, is_active) VALUES (?, ?, ?, ?, 1)`,
    [domainId, urlPattern, nextVersion, nowMs()],
  );

  const schemaId = await selectFirstInt(
    sqlite3,
    db,
    `SELECT id FROM schemas WHERE domain_id = ? AND url_pattern = ? AND version = ?`,
    [domainId, urlPattern, nextVersion],
  );
  if (!schemaId) throw new Error('Failed to create schema');

  for (let i = 0; i < headers.length; i++) {
    await run(sqlite3, db, `INSERT INTO schema_columns (schema_id, col_index, name, data_type) VALUES (?, ?, ?, 'text')`, [
      schemaId,
      i,
      headers[i],
    ]);
  }

  return schemaId;
}

function headersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if ((a[i] ?? '') !== (b[i] ?? '')) return false;
  return true;
}

async function getOrCreateSchemaId(
  sqlite3: SQLiteApi,
  db: number,
  domainId: number,
  urlPattern: string,
  headers: string[],
): Promise<number> {
  const activeSchemaId = await getActiveSchemaId(sqlite3, db, domainId, urlPattern);
  if (!activeSchemaId) return await createSchema(sqlite3, db, domainId, urlPattern, headers);

  const existing = await readSchemaHeaders(sqlite3, db, activeSchemaId);
  if (headersEqual(existing, headers)) return activeSchemaId;
  return await createSchema(sqlite3, db, domainId, urlPattern, headers);
}

export async function storeExtraction(payload: SQLiteExtractPayload): Promise<{ extractionId: number; domain: string }> {
  return await withWriteLock(async () => {
    const { sqlite3, db } = await getClient();

    await run(sqlite3, db, 'BEGIN');
    try {
      const domain = getHostname(payload.url);
      const urlPattern = getUrlPattern(payload.url);
      const domainId = await getOrCreateDomainId(sqlite3, db, domain);
      const headers = payload.table[0] ?? [];
      const schemaId = await getOrCreateSchemaId(sqlite3, db, domainId, urlPattern, headers);

      const rowCount = Math.max(0, payload.table.length - 1);
      await run(
        sqlite3,
        db,
        `INSERT INTO extractions (schema_id, url, page_title, extracted_at, row_count) VALUES (?, ?, ?, ?, ?)`,
        [schemaId, payload.url, payload.pageTitle ?? null, nowMs(), rowCount],
      );
      const extractionId = await selectFirstInt(sqlite3, db, `SELECT last_insert_rowid()`, []);
      if (!extractionId) throw new Error('Failed to insert extraction');

      const rows = payload.table.slice(1);
      for (let r = 0; r < rows.length; r++) {
        for (let c = 0; c < rows[r].length; c++) {
          await run(
            sqlite3,
            db,
            `INSERT INTO extraction_cells (extraction_id, row_index, col_index, value) VALUES (?, ?, ?, ?)`,
            [extractionId, r, c, rows[r][c] ?? null],
          );
        }
      }

      await run(sqlite3, db, 'COMMIT');
      return { extractionId, domain };
    } catch (e) {
      await run(sqlite3, db, 'ROLLBACK');
      throw e;
    }
  });
}

export async function listExtractionUrls(): Promise<string[]> {
  const { sqlite3, db } = await getClient();
  const res = await execWithParams(sqlite3, db, `SELECT url FROM extractions ORDER BY id ASC`, []);
  return (res.rows ?? []).map((r: any[]) => String(r[0] ?? ''));
}

export type ExtractionSummary = {
  id: number;
  domain: string;
  url: string;
  urlPattern?: string;
  pageTitle?: string;
  extractedAt: number;
  rowCount: number;
  schemaVersion: number;
};

export type ExtractionFilters = {
  domain?: string;
  urlSubstring?: string;
  extractedAfter?: number; // ms epoch inclusive
  extractedBefore?: number; // ms epoch inclusive
  urlPattern?: string;
  schemaVersion?: number;
};

export async function listExtractions(filters: ExtractionFilters = {}, limit = 50): Promise<ExtractionSummary[]> {
  const { sqlite3, db } = await getClient();

  const where: string[] = [];
  const params: any[] = [];

  if (filters.domain) {
    where.push(`d.domain = ?`);
    params.push(filters.domain);
  }
  if (filters.urlSubstring) {
    where.push(`e.url LIKE ?`);
    params.push(`%${filters.urlSubstring}%`);
  }
  if (typeof filters.extractedAfter === 'number') {
    where.push(`e.extracted_at >= ?`);
    params.push(filters.extractedAfter);
  }
  if (typeof filters.extractedBefore === 'number') {
    where.push(`e.extracted_at <= ?`);
    params.push(filters.extractedBefore);
  }
  if (typeof filters.schemaVersion === 'number') {
    where.push(`s.version = ?`);
    params.push(filters.schemaVersion);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const res = await execWithParams(
    sqlite3,
    db,
    `
      SELECT
        e.id,
        d.domain,
        e.url,
        s.url_pattern,
        e.page_title,
        e.extracted_at,
        e.row_count,
        s.version
      FROM extractions e
      JOIN schemas s ON s.id = e.schema_id
      JOIN domains d ON d.id = s.domain_id
      ${whereSql}
      ORDER BY e.extracted_at DESC, e.id DESC
      LIMIT ?
    `,
    [...params, limit],
  );

  return (res.rows ?? []).map((r: any[]) => ({
    id: Number(r[0]),
    domain: String(r[1] ?? ''),
    url: String(r[2] ?? ''),
    urlPattern: r[3] == null ? undefined : String(r[3]),
    pageTitle: r[4] == null ? undefined : String(r[4]),
    extractedAt: Number(r[5]),
    rowCount: Number(r[6]),
    schemaVersion: Number(r[7]),
  }));
}

export async function listDomainSchemaVersions(domain: string): Promise<number[]> {
  const { sqlite3, db } = await getClient();
  const res = await sqlite3.execWithParams(
    db,
    `
      SELECT DISTINCT s.version
      FROM schemas s
      JOIN domains d ON d.id = s.domain_id
      WHERE d.domain = ?
      ORDER BY s.version DESC
    `,
    [domain],
  );
  return (res.rows ?? []).map((r: any[]) => Number(r[0])).filter((n: any) => Number.isFinite(n));
}

export async function listRecentExtractions(limit = 25): Promise<ExtractionSummary[]> {
  const { sqlite3, db } = await getClient();
  const res = await execWithParams(
    sqlite3,
    db,
    `
      SELECT
        e.id,
        d.domain,
        e.url,
        s.url_pattern,
        e.page_title,
        e.extracted_at,
        e.row_count,
        s.version
      FROM extractions e
      JOIN schemas s ON s.id = e.schema_id
      JOIN domains d ON d.id = s.domain_id
      ORDER BY e.extracted_at DESC, e.id DESC
      LIMIT ?
    `,
    [limit],
  );

  return (res.rows ?? []).map((r: any[]) => ({
    id: Number(r[0]),
    domain: String(r[1] ?? ''),
    url: String(r[2] ?? ''),
    urlPattern: r[3] == null ? undefined : String(r[3]),
    pageTitle: r[4] == null ? undefined : String(r[4]),
    extractedAt: Number(r[5]),
    rowCount: Number(r[6]),
    schemaVersion: Number(r[7]),
  }));
}

export async function getExtractionTable(extractionId: number, maxRows: number | undefined = 20): Promise<string[][]> {
  const { sqlite3, db } = await getClient();

  const schemaRes = await execWithParams(sqlite3, db, `SELECT schema_id FROM extractions WHERE id = ?`, [extractionId]);
  const schemaId = schemaRes.rows?.[0]?.[0];
  if (!schemaId) throw new Error(`Extraction not found: ${extractionId}`);

  const headersRes = await execWithParams(
    sqlite3,
    db,
    `SELECT name FROM schema_columns WHERE schema_id = ? ORDER BY col_index ASC`,
    [schemaId],
  );
  const headers = (headersRes.rows ?? []).map((r: any[]) => String(r[0] ?? ''));

  const hasLimit = typeof maxRows === 'number' && Number.isFinite(maxRows);
  const cellsRes = await execWithParams(
    sqlite3,
    db,
    hasLimit
      ? `
        SELECT row_index, col_index, value
        FROM extraction_cells
        WHERE extraction_id = ? AND row_index < ?
        ORDER BY row_index ASC, col_index ASC
      `
      : `
        SELECT row_index, col_index, value
        FROM extraction_cells
        WHERE extraction_id = ?
        ORDER BY row_index ASC, col_index ASC
      `,
    hasLimit ? [extractionId, maxRows] : [extractionId],
  );

  const byRow: Record<number, Record<number, string>> = {};
  for (const row of cellsRes.rows ?? []) {
    const rIdx = Number(row[0]);
    const cIdx = Number(row[1]);
    const value = row[2] == null ? '' : String(row[2]);
    byRow[rIdx] = byRow[rIdx] ?? {};
    byRow[rIdx][cIdx] = value;
  }

  const dataRows: string[][] = [];
  const rowIndexes = Object.keys(byRow).map(Number).sort((a, b) => a - b);
  for (const rIdx of rowIndexes) {
    const cols = byRow[rIdx] ?? {};
    const row: string[] = [];
    const width = Math.max(headers.length, ...Object.keys(cols).map((n) => Number(n) + 1), 0);
    for (let c = 0; c < width; c++) {
      row.push(cols[c] ?? '');
    }
    dataRows.push(row);
  }

  return [headers, ...dataRows];
}

export async function deleteDomainData(domain: string): Promise<void> {
  const { sqlite3, db } = await getClient();

  await run(sqlite3, db, 'BEGIN');
  try {
    // Delete cells and extractions first to satisfy foreign keys.
    await run(
      sqlite3,
      db,
      `
        DELETE FROM extraction_cells
        WHERE extraction_id IN (
          SELECT e.id
          FROM extractions e
          JOIN schemas s ON s.id = e.schema_id
          JOIN domains d ON d.id = s.domain_id
          WHERE d.domain = ?
        )
      `,
      [domain],
    );

    await run(
      sqlite3,
      db,
      `
        DELETE FROM extractions
        WHERE schema_id IN (
          SELECT s.id
          FROM schemas s
          JOIN domains d ON d.id = s.domain_id
          WHERE d.domain = ?
        )
      `,
      [domain],
    );

    await run(
      sqlite3,
      db,
      `
        DELETE FROM schema_columns
        WHERE schema_id IN (
          SELECT s.id
          FROM schemas s
          JOIN domains d ON d.id = s.domain_id
          WHERE d.domain = ?
        )
      `,
      [domain],
    );

    await run(sqlite3, db, `DELETE FROM schemas WHERE domain_id = (SELECT id FROM domains WHERE domain = ?)`, [domain]);
    await run(sqlite3, db, `DELETE FROM domains WHERE domain = ?`, [domain]);

    await run(sqlite3, db, 'COMMIT');
  } catch (e) {
    await run(sqlite3, db, 'ROLLBACK');
    throw e;
  }
}

export async function clearAllData(): Promise<void> {
  const { sqlite3, db } = await getClient();

  await run(sqlite3, db, 'BEGIN');
  try {
    await run(sqlite3, db, `DELETE FROM extraction_cells`);
    await run(sqlite3, db, `DELETE FROM extractions`);
    await run(sqlite3, db, `DELETE FROM schema_columns`);
    await run(sqlite3, db, `DELETE FROM schemas`);
    await run(sqlite3, db, `DELETE FROM domains`);
    await run(sqlite3, db, 'COMMIT');
  } catch (e) {
    await run(sqlite3, db, 'ROLLBACK');
    throw e;
  }
}

export async function applyRetentionKeepLastPerDomain(keepLastPerDomain: number): Promise<{ deletedExtractions: number }> {
  const keepN = Math.max(0, Math.floor(keepLastPerDomain));
  const { sqlite3, db } = await getClient();

  const res = await execWithParams(
    sqlite3,
    db,
    `
      SELECT e.id, d.domain, e.extracted_at
      FROM extractions e
      JOIN schemas s ON s.id = e.schema_id
      JOIN domains d ON d.id = s.domain_id
    `,
    [],
  );
  const items = (res.rows ?? []).map((r: any[]) => ({
    id: Number(r[0]),
    domain: String(r[1] ?? ''),
    extractedAt: Number(r[2] ?? 0),
  }));

  const idsToDelete = computeExtractionIdsToDeleteKeepLastPerDomain(items, keepN);
  if (idsToDelete.length === 0) return { deletedExtractions: 0 };

  await run(sqlite3, db, 'BEGIN');
  try {
    for (const id of idsToDelete) {
      await run(sqlite3, db, `DELETE FROM extraction_cells WHERE extraction_id = ?`, [id]);
      await run(sqlite3, db, `DELETE FROM extractions WHERE id = ?`, [id]);
    }
    await run(sqlite3, db, 'COMMIT');
    return { deletedExtractions: idsToDelete.length };
  } catch (e) {
    await run(sqlite3, db, 'ROLLBACK');
    throw e;
  }
}

