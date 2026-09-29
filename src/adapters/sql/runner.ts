export type SqlValue = string | number | null;

export interface SqlStatement {
  sql: string;
  params: SqlValue[];
}

export interface SqlResult {
  rows: unknown[];
  changes: number;
}

/**
 * What the shared stores need from a SQLite database. D1 and node:sqlite each implement it, so
 * SqlLinkStore and SqlVisitStore run the same SQL on both.
 */
export interface SqlRunner {
  first<T>(statement: SqlStatement): Promise<T | null>;
  all<T>(statement: SqlStatement): Promise<T[]>;
  run(statement: SqlStatement): Promise<number>;
  /** Runs the statements in order, atomically, and returns one result per statement. */
  batch(statements: SqlStatement[]): Promise<SqlResult[]>;
}

export function sql(text: string, ...params: SqlValue[]): SqlStatement {
  return { sql: text, params };
}
