import initSqlJs from 'sql.js';
import { resolve } from 'path';

import { ensureSchema, storeExtractionInDb } from './core';

async function createDb() {
  const wasmPath = resolve(process.cwd(), 'node_modules/sql.js/dist/sql-wasm.wasm');
  const SQL = await initSqlJs({ locateFile: () => wasmPath });
  return new SQL.Database();
}

describe('sqlite core', () => {
  it('stores extraction rows and cells', async () => {
    const db = await createDb();
    try {
      ensureSchema(db);
      db.exec('BEGIN');
      const payload = {
        url: 'https://example.test/a',
        pageTitle: 'A',
        table: [
          ['Name', 'Age'],
          ['Alice', '30'],
          ['Bob', '40'],
        ],
      };
      const { extractionId, domain } = storeExtractionInDb(db, payload);
      db.exec('COMMIT');

      expect(domain).toBe('example.test');
      expect(extractionId).toBeGreaterThan(0);

      const extractions = db.exec(`SELECT url, row_count FROM extractions`);
      expect(extractions[0].values[0][0]).toBe(payload.url);
      expect(extractions[0].values[0][1]).toBe(2);

      const cells = db.exec(
        `SELECT row_index, col_index, value FROM extraction_cells WHERE extraction_id = ? ORDER BY row_index, col_index`,
        [extractionId],
      );
      expect(cells[0].values).toEqual([
        [0, 0, 'Alice'],
        [0, 1, '30'],
        [1, 0, 'Bob'],
        [1, 1, '40'],
      ]);
    } finally {
      db.close();
    }
  });

  it('creates new schema version when headers change', async () => {
    const db = await createDb();
    try {
      db.exec('BEGIN');

      storeExtractionInDb(db, {
        url: 'https://example.test/p1',
        table: [
          ['A', 'B'],
          ['1', '2'],
        ],
      });

      storeExtractionInDb(db, {
        url: 'https://example.test/p2',
        table: [
          ['A', 'B'],
          ['3', '4'],
        ],
      });

      storeExtractionInDb(db, {
        url: 'https://example.test/p3',
        table: [
          ['A', 'C'],
          ['5', '6'],
        ],
      });

      db.exec('COMMIT');

      const schemaVersions = db.exec(
        `SELECT version, is_active FROM schemas WHERE domain_id = (SELECT id FROM domains WHERE domain = ?) ORDER BY version`,
        ['example.test'],
      );
      expect(schemaVersions[0].values).toEqual([
        [1, 0],
        [2, 1],
      ]);
    } finally {
      db.close();
    }
  });
});

