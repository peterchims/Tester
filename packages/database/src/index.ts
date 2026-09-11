import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { Kysely, PostgresDialect, sql } from 'kysely';
import pg from 'pg';
import type {
  ScanOptions,
  ScanReport,
  ScanStage,
  ScanStatus,
} from '@techtester/contracts';

// pg returns numeric/int8 as strings by default; coerce the ones we use.
pg.types.setTypeParser(20, (value) => Number(value)); // int8
pg.types.setTypeParser(1700, (value) => Number(value)); // numeric

export interface ScanRow {
  id: string;
  url: string;
  normalized_url: string;
  session_id: string;
  status: ScanStatus;
  stage: ScanStage;
  progress: number;
  options: ScanOptions;
  overall_score: number | null;
  error: string | null;
  report: ScanReport | null;
  requested_at: Date;
  started_at: Date | null;
  finished_at: Date | null;
}

interface Database {
  scans: ScanRow;
}

let db: Kysely<Database> | null = null;

export function getDb(connectionString = process.env.DATABASE_URL): Kysely<Database> {
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  if (!db) {
    const pool = new pg.Pool({ connectionString, max: 10 });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  }
  return db;
}

export async function closeDb(): Promise<void> {
  await db?.destroy();
  db = null;
}

/** Apply the idempotent schema. Called on API and worker boot. */
export async function migrate(connectionString = process.env.DATABASE_URL): Promise<void> {
  const schemaPath = fileURLToPath(new URL('./schema.sql', import.meta.url));
  const ddl = await readFile(schemaPath, 'utf8');
  await sql.raw(ddl).execute(getDb(connectionString));
}

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export interface NewScan {
  id: string;
  url: string;
  normalizedUrl: string;
  sessionId: string;
  options: ScanOptions;
}

export const scans = {
  async create(input: NewScan): Promise<ScanRow> {
    return getDb()
      .insertInto('scans')
      .values({
        id: input.id,
        url: input.url,
        normalized_url: input.normalizedUrl,
        session_id: input.sessionId,
        options: toJson(input.options),
        status: 'queued',
        stage: 'queued',
        progress: 0,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  async get(id: string): Promise<ScanRow | undefined> {
    return getDb().selectFrom('scans').selectAll().where('id', '=', id).executeTakeFirst();
  },

  async listBySession(sessionId: string, limit = 25): Promise<ScanRow[]> {
    return getDb()
      .selectFrom('scans')
      .selectAll()
      .where('session_id', '=', sessionId)
      .orderBy('requested_at', 'desc')
      .limit(limit)
      .execute();
  },

  async markRunning(id: string): Promise<void> {
    await getDb()
      .updateTable('scans')
      .set({ status: 'running', stage: 'guard', progress: 2, started_at: new Date() })
      .where('id', '=', id)
      .execute();
  },

  async updateProgress(
    id: string,
    patch: { stage: ScanStage; progress: number },
  ): Promise<void> {
    await getDb()
      .updateTable('scans')
      .set({ stage: patch.stage, progress: patch.progress })
      .where('id', '=', id)
      .execute();
  },

  async complete(id: string, report: ScanReport): Promise<void> {
    await getDb()
      .updateTable('scans')
      .set({
        status: 'completed',
        stage: 'done',
        progress: 100,
        overall_score: report.overallScore,
        report: toJson(report),
        finished_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  },

  async fail(id: string, error: string): Promise<void> {
    await getDb()
      .updateTable('scans')
      .set({ status: 'failed', stage: 'error', error, finished_at: new Date() })
      .where('id', '=', id)
      .execute();
  },
};

// Kysely + pg expect jsonb columns to be passed as serialized strings.
function toJson<T>(value: T): unknown {
  return sql`${JSON.stringify(value)}::jsonb`;
}
