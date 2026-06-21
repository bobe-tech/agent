// Thin types for the TS consumer (api). core/db.js stays in JS.
import type { Pool } from 'pg';

export interface QueryResultLike<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number | null;
}

export function createPool(opts?: { test?: boolean }): Pool;
export function getPool(): Pool;
export function getExecutor(): unknown;
export function query<T = Record<string, unknown>>(
  text: string,
  params?: readonly unknown[],
): Promise<QueryResultLike<T>>;
export function withTransaction<T>(fn: (client: unknown) => Promise<T>): Promise<T>;
