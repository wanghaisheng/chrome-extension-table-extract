import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
// Vite will bundle this wasm and return a URL string.
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

import { loadDbBytes, saveDbBytes } from './storage';
import { SQLiteExtractPayload } from './types';
import { storeExtractionInDb } from './core';

let SQL_PROMISE: Promise<SqlJsStatic> | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!SQL_PROMISE) {
    SQL_PROMISE = (async () => {
      const wasmBinary = new Uint8Array(await (await fetch(wasmUrl)).arrayBuffer());
      return (await initSqlJs({
        locateFile: () => wasmUrl,
        wasmBinary,
      })) as unknown as SqlJsStatic;
    })();
  }
  return SQL_PROMISE;
}

async function openDb(): Promise<Database> {
  const SQL = await getSql();
  const bytes = await loadDbBytes();
  return bytes ? new SQL.Database(bytes) : new SQL.Database();
}

async function persistDb(db: Database): Promise<void> {
  const bytes = db.export();
  await saveDbBytes(bytes);
}

export async function storeExtraction(payload: SQLiteExtractPayload): Promise<{ extractionId: number; domain: string }> {
  const db = await openDb();
  try {
    db.exec('BEGIN');
    const { extractionId, domain } = storeExtractionInDb(db, payload);

    db.exec('COMMIT');
    await persistDb(db);
    return { extractionId, domain };
  } catch (e) {
    try {
      db.exec('ROLLBACK');
    } catch {
      // ignore
    }
    throw e;
  } finally {
    db.close();
  }
}

