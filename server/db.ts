import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
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

let _pool: Pool | null = null;
let _db: ReturnType<typeof drizzle> | null = null;

function getDatabaseUrl() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  return url;
}

export function getDb() {
  if (!_pool) {
    _pool = new Pool({ connectionString: getDatabaseUrl() });
  }
  if (!_db) {
    _db = drizzle(_pool);
  }
  return _db;
}

export async function listHostSpecies() {
  const db = getDb();
  return db.select().from(hostSpecies).orderBy(desc(hostSpecies.updatedAt));
}

export async function getHostSpeciesById(id: number) {
  const db = getDb();
  const rows = await db.select().from(hostSpecies).where(eq(hostSpecies.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function upsertHostSpecies(input: {
  id?: number;
  name: string;
  scientificName?: string | null;
  category?: string | null;
  codonTable?: any | null;
  isActive?: boolean;
}) {
  const db = getDb();
  const values: InsertHostSpecies = {
    name: input.name,
    scientificName: input.scientificName ?? null,
    category: input.category ?? null,
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
  const db = getDb();
  await db.delete(hostSpecies).where(eq(hostSpecies.id, id));
}

export async function listRestrictionEnzymes() {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  await db.delete(restrictionEnzymes).where(eq(restrictionEnzymes.id, id));
}

export async function insertOptimizationRun(run: InsertOptimizationRun) {
  const db = getDb();
  await db.insert(optimizationRuns).values(run);
}

export async function insertPrimerDesignRun(run: InsertPrimerDesignRun) {
  const db = getDb();
  await db.insert(primerDesignRuns).values(run);
}

export async function listRecentOptimizedSequences(limit = 200) {
  const db = getDb();
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
  const db = getDb();
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
  const db = getDb();
  if (type === "optimization") {
    const rows = await db.select().from(optimizationRuns).where(eq(optimizationRuns.runId, runId)).limit(1);
    return rows[0] ?? null;
  }
  const rows = await db.select().from(primerDesignRuns).where(eq(primerDesignRuns.runId, runId)).limit(1);
  return rows[0] ?? null;
}

export async function deleteRunByTypeAndId(type: "optimization" | "primer_design", runId: string) {
  const db = getDb();
  if (type === "optimization") {
    await db.delete(optimizationRuns).where(eq(optimizationRuns.runId, runId));
    return;
  }
  await db.delete(primerDesignRuns).where(eq(primerDesignRuns.runId, runId));
}

export async function clearRuns(type: "all" | "optimization" | "primer_design") {
  const db = getDb();
  if (type === "all" || type === "optimization") {
    await db.delete(optimizationRuns);
  }
  if (type === "all" || type === "primer_design") {
    await db.delete(primerDesignRuns);
  }
}
