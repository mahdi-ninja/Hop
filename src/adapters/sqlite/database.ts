import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { inTransaction } from './runner';

export function openDatabase(path: string): DatabaseSync {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  db.exec('PRAGMA busy_timeout = 5000');
  return db;
}

/**
 * Applies migrations/*.sql in filename order. Uses Wrangler's d1_migrations table so a database
 * exported from D1 keeps its migration history and isn't migrated twice.
 */
export function applyMigrations(db: DatabaseSync, dir: string): string[] {
  db.exec(`CREATE TABLE IF NOT EXISTS d1_migrations(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
  )`);
  const applied = new Set(
    (db.prepare('SELECT name FROM d1_migrations').all() as { name: string }[]).map((row) => row.name),
  );
  const pending = readdirSync(dir)
    .filter((name) => name.endsWith('.sql') && !applied.has(name))
    .sort();
  for (const name of pending) {
    inTransaction(db, () => {
      db.exec(readFileSync(join(dir, name), 'utf8'));
      db.prepare('INSERT INTO d1_migrations (name) VALUES (?)').run(name);
    });
  }
  return pending;
}
