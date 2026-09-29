import type { SqlResult, SqlRunner, SqlStatement } from '../sql/runner';

export class D1Runner implements SqlRunner {
  constructor(private readonly db: D1Database) {}

  private prepare(statement: SqlStatement): D1PreparedStatement {
    return this.db.prepare(statement.sql).bind(...statement.params);
  }

  first<T>(statement: SqlStatement): Promise<T | null> {
    return this.prepare(statement).first<T>();
  }

  async all<T>(statement: SqlStatement): Promise<T[]> {
    return (await this.prepare(statement).all<T>()).results;
  }

  async run(statement: SqlStatement): Promise<number> {
    return (await this.prepare(statement).run()).meta.changes;
  }

  async batch(statements: SqlStatement[]): Promise<SqlResult[]> {
    const results = await this.db.batch(statements.map((s) => this.prepare(s)));
    return results.map((r) => ({ rows: r.results, changes: r.meta.changes }));
  }
}
