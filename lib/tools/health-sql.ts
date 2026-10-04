import { sql } from "drizzle-orm";

// Read-only guard, two layers:
// 1. Regex pre-filter: a single SELECT/WITH statement, no separator, and none of
//    the data-modifying keywords anywhere (catches `WITH x AS (DELETE ...) SELECT`,
//    which the old prefix check let through). Word-boundary matching keeps
//    column names like `updated_at` or `deleted` legal.
// 2. Execution as `SELECT * FROM (<query>) AS q`: Postgres rejects a
//    data-modifying CTE that is not at the top level of the statement
//    ("WITH clause containing a data-modifying statement must be at the top
//    level"), so even a guard miss cannot write.
// The README also documents pointing health_sql at a SELECT-only role.
const FORBIDDEN = /\b(delete|update|insert|truncate|drop|alter|grant|revoke|create|copy|call|do|execute|merge)\b/i;

export function assertReadOnly(query: string): void {
  const trimmed = query.trim().replace(/;\s*$/, ""); // allow one trailing semicolon
  if (trimmed.includes(";")) throw new Error("Only a single statement is allowed.");
  if (!/^(select|with)\b/i.test(trimmed)) throw new Error("Only read-only SELECT/WITH queries are allowed.");
  const hit = FORBIDDEN.exec(trimmed);
  if (hit) throw new Error(`Only read-only queries are allowed (found "${hit[1].toUpperCase()}").`);
}

// The query the guard accepted, wrapped so it can only ever be a subquery.
export function wrapReadOnly(query: string): string {
  return `SELECT * FROM (${query.trim().replace(/;\s*$/, "")}) AS q`;
}

export async function healthSql(db: any, query: string) {
  assertReadOnly(query);
  const result = await db.execute(sql.raw(wrapReadOnly(query)));
  return result.rows ?? result;
}
