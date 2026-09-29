import type { DatabaseSync, StatementSync } from 'node:sqlite';
import type { SqlResult, SqlRunner, SqlStatement } from '../sql/runner';

export function inTransaction<T>(db: DatabaseSync, work: () => T): T {
  db.exec('BEGIN');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    // SQLite ends the transaction itself on some errors (e.g. a full disk); ROLLBACK would then
    // throw and hide the real error.
    if (db.isTransaction) db.exec('ROLLBACK');
    throw err;
  }
}

// node:sqlite is synchronous, so each call runs to completion without interleaving with other
// requests; the Promises only exist to satisfy the interface D1 shares.
export class SqliteRunner implements SqlRunner {
  private readonly statements = new Map<string, StatementSync>();

  constructor(private readonly db: DatabaseSync) {}

  private prepare(sql: string): StatementSync {
    let statement = this.statements.get(sql);
    if (!statement) {
      statement = this.db.prepare(sql);
      this.statements.set(sql, statement);
    }
    return statement;
  }

  async first<T>(s: SqlStatement): Promise<T | null> {
    return (this.prepare(s.sql).get(...s.params) as T | undefined) ?? null;
  }

  async all<T>(s: SqlStatement): Promise<T[]> {
    return this.prepare(s.sql).all(...s.params) as T[];
  }

  async run(s: SqlStatement): Promise<number> {
    return Number(this.prepare(s.sql).run(...s.params).changes);
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    return inTransaction(this.db, () =>
      statements.map((s) => {
        const statement = this.prepare(s.sql);
        if (statement.columns().length > 0) return { rows: statement.all(...s.params), changes: 0 };
        return { rows: [], changes: Number(statement.run(...s.params).changes) };
      }),
    );
  }
}
