import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { applyMigrations, openDatabase } from '../../src/adapters/sqlite/database';

const MIGRATIONS = new URL('../../migrations', import.meta.url).pathname;

describe('applyMigrations', () => {
  it('applies every migration once, in order, and records them like Wrangler', () => {
    const db = openDatabase(':memory:');
    expect(applyMigrations(db, MIGRATIONS)).toEqual(['0001_init.sql', '0002_routing_rules.sql']);
    expect(applyMigrations(db, MIGRATIONS)).toEqual([]);
    expect(db.prepare('SELECT id, name FROM d1_migrations ORDER BY id').all()).toEqual([
      { id: 1, name: '0001_init.sql' },
      { id: 2, name: '0002_routing_rules.sql' },
    ]);
  });

  it('skips migrations a D1 export already recorded', () => {
    const db = openDatabase(':memory:');
    db.exec(readFileSync(join(MIGRATIONS, '0001_init.sql'), 'utf8'));
    db.exec(`CREATE TABLE d1_migrations(
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    )`);
    db.exec("INSERT INTO d1_migrations (name) VALUES ('0001_init.sql')");
    expect(applyMigrations(db, MIGRATIONS)).toEqual(['0002_routing_rules.sql']);
  });

  it('leaves no trace of a migration that fails', () => {
    const dir = mkdtempSync(join(tmpdir(), 'hop-migrations-'));
    writeFileSync(join(dir, '0001_ok.sql'), 'CREATE TABLE t (id INTEGER);');
    writeFileSync(join(dir, '0002_bad.sql'), 'CREATE TABLE u (id INTEGER); INSERT INTO missing VALUES (1);');
    const db = openDatabase(':memory:');
    expect(() => applyMigrations(db, dir)).toThrow();
    expect(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('t', 'u')").all()).toEqual([
      { name: 't' },
    ]);
    expect(db.prepare('SELECT name FROM d1_migrations').all()).toEqual([{ name: '0001_ok.sql' }]);
  });

  it('opens a file database in WAL mode with foreign keys on', () => {
    const db = openDatabase(join(mkdtempSync(join(tmpdir(), 'hop-db-')), 'nested', 'hop.db'));
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    expect(db.prepare('PRAGMA foreign_keys').get()).toEqual({ foreign_keys: 1 });
  });
});
