import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import path from "node:path";
import { asc, desc, eq, sql } from "drizzle-orm";
import {
  hostSpecies,
  restrictionEnzymes,
  optimizationRuns,
  primerDesignRuns,
  type InsertHostSpecies,
  type InsertRestrictionEnzyme,
  type InsertOptimizationRun,
  type InsertPrimerDesignRun,
} from "../drizzle/schema";

// Idempotent schema bootstrap for the embedded database. The packaged desktop
// app ships without an external Postgres or a `drizzle-kit push` step, so the
// enum types and tables are created here on first launch. Column identifiers
// are quoted to match the camelCase names declared in drizzle/schema.ts.
const BOOTSTRAP_SQL = `
DO $$ BEGIN
  CREATE TYPE restriction_enzyme_overhang AS ENUM ('blunt', '5_prime', '3_prime');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE run_mode AS ENUM ('single', 'batch');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE run_status AS ENUM ('success', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  CREATE TYPE primer_arm_policy AS ENUM ('none', 'batch_default', 'row_override', 'mixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS host_species (
  id serial PRIMARY KEY,
  name varchar(100) NOT NULL UNIQUE,
  "scientificName" varchar(200),
  category varchar(50),
  "sortOrder" integer DEFAULT 0 NOT NULL,
  "codonTable" jsonb,
  "isActive" boolean DEFAULT true NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS restriction_enzymes (
  id serial PRIMARY KEY,
  name varchar(50) NOT NULL UNIQUE,
  "recognitionSequence" varchar(50) NOT NULL,
  "cutPattern" varchar(100),
  overhang restriction_enzyme_overhang,
  "methylationSensitivity" varchar(100),
  "isCommon" boolean DEFAULT false NOT NULL,
  "createdAt" timestamp DEFAULT now() NOT NULL,
  "updatedAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS optimization_runs (
  id serial PRIMARY KEY,
  "runId" varchar(50) NOT NULL UNIQUE,
  mode run_mode NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  status run_status NOT NULL,
  "errorMessage" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS primer_design_runs (
  id serial PRIMARY KEY,
  "runId" varchar(50) NOT NULL UNIQUE,
  mode run_mode NOT NULL,
  "armPolicy" primer_arm_policy DEFAULT 'none' NOT NULL,
  input jsonb NOT NULL,
  output jsonb,
  status run_status NOT NULL,
  "errorMessage" text,
  "createdAt" timestamp DEFAULT now() NOT NULL
);
`;

function resolveDataDir(): string {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (configured) return configured;
  return path.resolve(process.cwd(), ".pglite-data");
}

let _client: PGlite | null = null;
let _db: ReturnType<typeof drizzle> | null = null;
let _initPromise: Promise<ReturnType<typeof drizzle>> | null = null;

async function ensureDb(): Promise<ReturnType<typeof drizzle>> {
  if (_db) return _db;
  if (!_initPromise) {
    _initPromise = (async () => {
      const client = new PGlite(resolveDataDir());
      await client.waitReady;
      await client.exec(BOOTSTRAP_SQL);
      _client = client;
      _db = drizzle(client);
      return _db;
    })();
  }
  return _initPromise;
}

/**
 * Returns the embedded database, initializing the PGlite instance and creating
 * the schema on first call. Safe to call concurrently — initialization is
 * memoized behind a single promise.
 */
export async function getDb() {
  return ensureDb();
}

/** Explicitly initialize the embedded database (schema bootstrap) up front. */
export async function initDb(): Promise<void> {
  await ensureDb();
}

export async function listHostSpecies() {
  const db = await getDb();
  return db.select().from(hostSpecies).orderBy(asc(hostSpecies.sortOrder), desc(hostSpecies.updatedAt));
}

async function getNextHostSpeciesSortOrder() {
  const db = await getDb();
  const result = await db
    .select({
      maxSortOrder: sql<number>`coalesce(max(${hostSpecies.sortOrder}), -1)`,
    })
    .from(hostSpecies);
  return Number(result[0]?.maxSortOrder ?? -1) + 1;
}

export async function getHostSpeciesById(id: number) {
  const db = await getDb();
  const rows = await db.select().from(hostSpecies).where(eq(hostSpecies.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function upsertHostSpecies(input: {
  id?: number;
  name: string;
  scientificName?: string | null;
  category?: string | null;
  sortOrder?: number | null;
  codonTable?: any | null;
  isActive?: boolean;
}) {
  const db = await getDb();
  const existing = input.id ? await getHostSpeciesById(input.id) : null;
  const resolvedSortOrder =
    input.sortOrder ?? existing?.sortOrder ?? (await getNextHostSpeciesSortOrder());
  const values: InsertHostSpecies = {
    name: input.name,
    scientificName: input.scientificName ?? null,
    category: input.category ?? null,
    sortOrder: resolvedSortOrder,
    codonTable: input.codonTable ?? null,
    isActive: input.isActive ?? true,
    updatedAt: new Date(),
  };

  if (input.id) {
    const updated = await db
      .update(hostSpecies)
      .set(values)
      .where(eq(hostSpecies.id, input.id))
      .returning();
    return updated[0] ?? null;
  }

  const inserted = await db
    .insert(hostSpecies)
    .values(values)
    .onConflictDoUpdate({
      target: hostSpecies.name,
      set: values,
    })
    .returning();
  return inserted[0] ?? null;
}

export async function deleteHostSpecies(id: number) {
  const db = await getDb();
  await db.delete(hostSpecies).where(eq(hostSpecies.id, id));
}

export async function saveHostSpeciesOrder(orderedIds: number[]) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx
        .update(hostSpecies)
        .set({
          sortOrder: index,
          updatedAt: new Date(),
        })
        .where(eq(hostSpecies.id, orderedIds[index]));
    }
  });
}

export async function listRestrictionEnzymes() {
  const db = await getDb();
  return db.select().from(restrictionEnzymes).orderBy(desc(restrictionEnzymes.updatedAt));
}

export async function upsertRestrictionEnzyme(input: {
  id?: number;
  name: string;
  recognitionSequence: string;
  cutPattern?: string | null;
  overhang?: "blunt" | "5_prime" | "3_prime" | null;
  methylationSensitivity?: string | null;
  isCommon?: boolean;
}) {
  const db = await getDb();
  const values: InsertRestrictionEnzyme = {
    name: input.name,
    recognitionSequence: input.recognitionSequence,
    cutPattern: input.cutPattern ?? null,
    overhang: input.overhang ?? null,
    methylationSensitivity: input.methylationSensitivity ?? null,
    isCommon: input.isCommon ?? false,
    updatedAt: new Date(),
  };

  if (input.id) {
    const updated = await db
      .update(restrictionEnzymes)
      .set(values)
      .where(eq(restrictionEnzymes.id, input.id))
      .returning();
    return updated[0] ?? null;
  }

  const inserted = await db
    .insert(restrictionEnzymes)
    .values(values)
    .onConflictDoUpdate({
      target: restrictionEnzymes.name,
      set: values,
    })
    .returning();
  return inserted[0] ?? null;
}

export async function deleteRestrictionEnzyme(id: number) {
  const db = await getDb();
  await db.delete(restrictionEnzymes).where(eq(restrictionEnzymes.id, id));
}

export async function insertOptimizationRun(run: InsertOptimizationRun) {
  const db = await getDb();
  await db.insert(optimizationRuns).values(run);
}

export async function insertPrimerDesignRun(run: InsertPrimerDesignRun) {
  const db = await getDb();
  await db.insert(primerDesignRuns).values(run);
}

export async function listRecentOptimizedSequences(limit = 200) {
  const db = await getDb();
  const runs = await db
    .select({
      runId: optimizationRuns.runId,
      createdAt: optimizationRuns.createdAt,
      output: optimizationRuns.output,
      status: optimizationRuns.status,
    })
    .from(optimizationRuns)
    .orderBy(desc(optimizationRuns.createdAt))
    .limit(100);

  const items: Array<{
    jobId: string;
    geneName: string;
    optimizedSequence: string;
    optimizedAt: Date;
  }> = [];

  for (const run of runs as any[]) {
    if (run.status !== "success") continue;
    const createdAt = run.createdAt ? new Date(run.createdAt) : new Date(0);
    const output = run.output as any;
    const results = Array.isArray(output?.results) ? output.results : [];
    for (const r of results) {
      if (items.length >= limit) break;
      const geneName = (r?.geneName ?? "").toString();
      const optimizedSequence = (r?.optimizedSequence ?? "").toString();
      if (!geneName || !optimizedSequence) continue;
      items.push({
        jobId: run.runId,
        geneName,
        optimizedSequence,
        optimizedAt: createdAt,
      });
    }
    if (items.length >= limit) break;
  }

  return items;
}

export async function listRuns(input: { type: "all" | "optimization" | "primer_design"; limit: number }) {
  const db = await getDb();
  const limit = input.limit;

  if (input.type === "optimization") {
    const rows = await db.select().from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt)).limit(limit);
    return rows.map((r: any) => ({ type: "optimization" as const, ...r }));
  }
  if (input.type === "primer_design") {
    const rows = await db.select().from(primerDesignRuns).orderBy(desc(primerDesignRuns.createdAt)).limit(limit);
    return rows.map((r: any) => ({ type: "primer_design" as const, ...r }));
  }

  const opt = await db.select().from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt)).limit(limit);
  const prim = await db.select().from(primerDesignRuns).orderBy(desc(primerDesignRuns.createdAt)).limit(limit);

  return [
    ...opt.map((r: any) => ({ type: "optimization" as const, ...r })),
    ...prim.map((r: any) => ({ type: "primer_design" as const, ...r })),
  ]
    .sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0))
    .slice(0, limit);
}

export async function getRunByTypeAndId(type: "optimization" | "primer_design", runId: string) {
  const db = await getDb();
  if (type === "optimization") {
    const rows = await db.select().from(optimizationRuns).where(eq(optimizationRuns.runId, runId)).limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.select().from(primerDesignRuns).where(eq(primerDesignRuns.runId, runId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteRunByTypeAndId(type: "optimization" | "primer_design", runId: string) {
  const db = await getDb();
  if (type === "optimization") {
    await db.delete(optimizationRuns).where(eq(optimizationRuns.runId, runId));
    return;
  }
  await db.delete(primerDesignRuns).where(eq(primerDesignRuns.runId, runId));
}

export async function clearRuns(type: "all" | "optimization" | "primer_design") {
  const db = await getDb();
  if (type === "all" || type === "optimization") {
    await db.delete(optimizationRuns);
  }
  if (type === "all" || type === "primer_design") {
    await db.delete(primerDesignRuns);
  }
}
