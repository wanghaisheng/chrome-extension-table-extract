import { type Database, type SqlValue } from 'sql.js';

import { SQLiteExtractPayload } from './types';

function nowMs(): number {
  return Date.now();
}

function getHostname(url: string): string {
  return new URL(url).hostname;
}

export function ensureSchema(db: Database): void {
  db.exec(`
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
  `);
}

function selectFirstInt(db: Database, sql: string, params: SqlValue[] = []): number | null {
  const res = db.exec(sql, params);
  if (!res.length) return null;
  const row = res[0].values?.[0];
  if (!row || row[0] == null) return null;
  return Number(row[0]);
}

function getOrCreateDomainId(db: Database, domain: string): number {
  db.run(`INSERT OR IGNORE INTO domains (domain, created_at) VALUES (?, ?)`, [domain, nowMs()]);
  const id = selectFirstInt(db, `SELECT id FROM domains WHERE domain = ?`, [domain]);
  if (!id) throw new Error(`Failed to load domain id for ${domain}`);
  return id;
}

function getActiveSchemaId(db: Database, domainId: number): number | null {
  return selectFirstInt(
    db,
    `SELECT id FROM schemas WHERE domain_id = ? AND is_active = 1 ORDER BY version DESC LIMIT 1`,
    [domainId],
  );
}

function readSchemaHeaders(db: Database, schemaId: number): string[] {
  const res = db.exec(`SELECT name FROM schema_columns WHERE schema_id = ? ORDER BY col_index ASC`, [schemaId]);
  if (!res.length) return [];
  return res[0].values.map((v) => String((v as unknown[])[0] ?? ''));
}

function createSchema(db: Database, domainId: number, headers: string[]): number {
  const nextVersion =
    selectFirstInt(db, `SELECT COALESCE(MAX(version), 0) + 1 FROM schemas WHERE domain_id = ?`, [domainId]) ?? 1;

  db.run(`UPDATE schemas SET is_active = 0 WHERE domain_id = ?`, [domainId]);
  db.run(`INSERT INTO schemas (domain_id, version, created_at, is_active) VALUES (?, ?, ?, 1)`, [
    domainId,
    nextVersion,
    nowMs(),
  ]);

  const schemaId = selectFirstInt(db, `SELECT id FROM schemas WHERE domain_id = ? AND version = ?`, [
    domainId,
    nextVersion,
  ]);
  if (!schemaId) throw new Error('Failed to create schema');

  const stmt = db.prepare(`INSERT INTO schema_columns (schema_id, col_index, name, data_type) VALUES (?, ?, ?, 'text')`);
  try {
    headers.forEach((name, idx) => stmt.run([schemaId, idx, name]));
  } finally {
    stmt.free();
  }

  return schemaId;
}

function headersEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if ((a[i] ?? '') !== (b[i] ?? '')) return false;
  }
  return true;
}

function getOrCreateSchemaId(db: Database, domainId: number, headers: string[]): number {
  const activeSchemaId = getActiveSchemaId(db, domainId);
  if (!activeSchemaId) return createSchema(db, domainId, headers);

  const existingHeaders = readSchemaHeaders(db, activeSchemaId);
  if (headersEqual(existingHeaders, headers)) return activeSchemaId;

  return createSchema(db, domainId, headers);
}

function insertExtraction(db: Database, schemaId: number, payload: SQLiteExtractPayload): number {
  const rowCount = Math.max(0, payload.table.length - 1);
  db.run(
    `INSERT INTO extractions (schema_id, url, page_title, extracted_at, row_count) VALUES (?, ?, ?, ?, ?)`,
    [schemaId, payload.url, payload.pageTitle ?? null, nowMs(), rowCount],
  );
  const id = selectFirstInt(db, `SELECT last_insert_rowid()`);
  if (!id) throw new Error('Failed to insert extraction');
  return id;
}

function insertCells(db: Database, extractionId: number, table: string[][]): void {
  const rows = table.slice(1);
  const stmt = db.prepare(`INSERT INTO extraction_cells (extraction_id, row_index, col_index, value) VALUES (?, ?, ?, ?)`);
  try {
    rows.forEach((row, rIdx) => {
      row.forEach((value, cIdx) => {
        stmt.run([extractionId, rIdx, cIdx, value ?? null]);
      });
    });
  } finally {
    stmt.free();
  }
}

export function storeExtractionInDb(
  db: Database,
  payload: SQLiteExtractPayload,
): { extractionId: number; domain: string } {
  ensureSchema(db);

  const domain = getHostname(payload.url);
  const domainId = getOrCreateDomainId(db, domain);
  const headers = payload.table[0] ?? [];
  const schemaId = getOrCreateSchemaId(db, domainId, headers);
  const extractionId = insertExtraction(db, schemaId, payload);
  insertCells(db, extractionId, payload.table);

  return { extractionId, domain };
}

