// electron/main.ts
import { app, BrowserWindow, ipcMain, shell } from "electron";
import path5 from "node:path";

// server/_core/index.ts
import dotenv from "dotenv";
import fs3 from "fs";
import path4 from "path";
import { fileURLToPath } from "url";
import express2 from "express";
import multer from "multer";
import { parseFile } from "seqparse";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";

// server/routers.ts
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";

// server/_core/trpc.ts
import { initTRPC } from "@trpc/server";
import superjson from "superjson";
var t = initTRPC.context().create({
  transformer: superjson
});
var router = t.router;
var publicProcedure = t.procedure;

// server/db.ts
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import path from "node:path";
import { asc, desc, eq, sql } from "drizzle-orm";

// drizzle/schema.ts
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar
} from "drizzle-orm/pg-core";
var restrictionEnzymeOverhang = pgEnum("restriction_enzyme_overhang", [
  "blunt",
  "5_prime",
  "3_prime"
]);
var hostSpecies = pgTable("host_species", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  scientificName: varchar("scientificName", { length: 200 }),
  category: varchar("category", { length: 50 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  codonTable: jsonb("codonTable"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var restrictionEnzymes = pgTable("restriction_enzymes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  recognitionSequence: varchar("recognitionSequence", { length: 50 }).notNull(),
  cutPattern: varchar("cutPattern", { length: 100 }),
  overhang: restrictionEnzymeOverhang("overhang"),
  methylationSensitivity: varchar("methylationSensitivity", { length: 100 }),
  isCommon: boolean("isCommon").default(false).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" }).defaultNow().notNull().$onUpdate(() => /* @__PURE__ */ new Date())
});
var runMode = pgEnum("run_mode", ["single", "batch"]);
var runStatus = pgEnum("run_status", ["success", "failed"]);
var primerArmPolicy = pgEnum("primer_arm_policy", [
  "none",
  "batch_default",
  "row_override",
  "mixed"
]);
var optimizationRuns = pgTable("optimization_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("runId", { length: 50 }).notNull().unique(),
  mode: runMode("mode").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  status: runStatus("status").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});
var primerDesignRuns = pgTable("primer_design_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("runId", { length: 50 }).notNull().unique(),
  mode: runMode("mode").notNull(),
  armPolicy: primerArmPolicy("armPolicy").default("none").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  status: runStatus("status").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull()
});

// server/db.ts
var BOOTSTRAP_SQL = `
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
function resolveDataDir() {
  const configured = process.env.PGLITE_DATA_DIR?.trim();
  if (configured) return configured;
  return path.resolve(process.cwd(), ".pglite-data");
}
var _client = null;
var _db = null;
var _initPromise = null;
async function ensureDb() {
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
async function getDb() {
  return ensureDb();
}
async function initDb() {
  await ensureDb();
}
async function listHostSpecies() {
  const db = await getDb();
  return db.select().from(hostSpecies).orderBy(asc(hostSpecies.sortOrder), desc(hostSpecies.updatedAt));
}
async function getNextHostSpeciesSortOrder() {
  const db = await getDb();
  const result = await db.select({
    maxSortOrder: sql`coalesce(max(${hostSpecies.sortOrder}), -1)`
  }).from(hostSpecies);
  return Number(result[0]?.maxSortOrder ?? -1) + 1;
}
async function getHostSpeciesById(id) {
  const db = await getDb();
  const rows = await db.select().from(hostSpecies).where(eq(hostSpecies.id, id)).limit(1);
  return rows[0] ?? null;
}
async function upsertHostSpecies(input) {
  const db = await getDb();
  const existing = input.id ? await getHostSpeciesById(input.id) : null;
  const resolvedSortOrder = input.sortOrder ?? existing?.sortOrder ?? await getNextHostSpeciesSortOrder();
  const values = {
    name: input.name,
    scientificName: input.scientificName ?? null,
    category: input.category ?? null,
    sortOrder: resolvedSortOrder,
    codonTable: input.codonTable ?? null,
    isActive: input.isActive ?? true,
    updatedAt: /* @__PURE__ */ new Date()
  };
  if (input.id) {
    const updated = await db.update(hostSpecies).set(values).where(eq(hostSpecies.id, input.id)).returning();
    return updated[0] ?? null;
  }
  const inserted = await db.insert(hostSpecies).values(values).onConflictDoUpdate({
    target: hostSpecies.name,
    set: values
  }).returning();
  return inserted[0] ?? null;
}
async function deleteHostSpecies(id) {
  const db = await getDb();
  await db.delete(hostSpecies).where(eq(hostSpecies.id, id));
}
async function saveHostSpeciesOrder(orderedIds) {
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (let index = 0; index < orderedIds.length; index += 1) {
      await tx.update(hostSpecies).set({
        sortOrder: index,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(hostSpecies.id, orderedIds[index]));
    }
  });
}
async function listRestrictionEnzymes() {
  const db = await getDb();
  return db.select().from(restrictionEnzymes).orderBy(desc(restrictionEnzymes.updatedAt));
}
async function upsertRestrictionEnzyme(input) {
  const db = await getDb();
  const values = {
    name: input.name,
    recognitionSequence: input.recognitionSequence,
    cutPattern: input.cutPattern ?? null,
    overhang: input.overhang ?? null,
    methylationSensitivity: input.methylationSensitivity ?? null,
    isCommon: input.isCommon ?? false,
    updatedAt: /* @__PURE__ */ new Date()
  };
  if (input.id) {
    const updated = await db.update(restrictionEnzymes).set(values).where(eq(restrictionEnzymes.id, input.id)).returning();
    return updated[0] ?? null;
  }
  const inserted = await db.insert(restrictionEnzymes).values(values).onConflictDoUpdate({
    target: restrictionEnzymes.name,
    set: values
  }).returning();
  return inserted[0] ?? null;
}
async function deleteRestrictionEnzyme(id) {
  const db = await getDb();
  await db.delete(restrictionEnzymes).where(eq(restrictionEnzymes.id, id));
}
async function insertOptimizationRun(run) {
  const db = await getDb();
  await db.insert(optimizationRuns).values(run);
}
async function insertPrimerDesignRun(run) {
  const db = await getDb();
  await db.insert(primerDesignRuns).values(run);
}
async function listRecentOptimizedSequences(limit = 200) {
  const db = await getDb();
  const runs = await db.select({
    runId: optimizationRuns.runId,
    createdAt: optimizationRuns.createdAt,
    output: optimizationRuns.output,
    status: optimizationRuns.status
  }).from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt)).limit(100);
  const items = [];
  for (const run of runs) {
    if (run.status !== "success") continue;
    const createdAt = run.createdAt ? new Date(run.createdAt) : /* @__PURE__ */ new Date(0);
    const output = run.output;
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
        optimizedAt: createdAt
      });
    }
    if (items.length >= limit) break;
  }
  return items;
}
async function listRuns(input) {
  const db = await getDb();
  const limit = input.limit;
  if (input.type === "optimization") {
    const rows = await db.select().from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt)).limit(limit);
    return rows.map((r) => ({ type: "optimization", ...r }));
  }
  if (input.type === "primer_design") {
    const rows = await db.select().from(primerDesignRuns).orderBy(desc(primerDesignRuns.createdAt)).limit(limit);
    return rows.map((r) => ({ type: "primer_design", ...r }));
  }
  const opt = await db.select().from(optimizationRuns).orderBy(desc(optimizationRuns.createdAt)).limit(limit);
  const prim = await db.select().from(primerDesignRuns).orderBy(desc(primerDesignRuns.createdAt)).limit(limit);
  return [
    ...opt.map((r) => ({ type: "optimization", ...r })),
    ...prim.map((r) => ({ type: "primer_design", ...r }))
  ].sort((a, b) => (b.createdAt?.getTime?.() ?? 0) - (a.createdAt?.getTime?.() ?? 0)).slice(0, limit);
}
async function getRunByTypeAndId(type, runId) {
  const db = await getDb();
  if (type === "optimization") {
    const rows2 = await db.select().from(optimizationRuns).where(eq(optimizationRuns.runId, runId)).limit(1);
    return rows2[0] ?? null;
  }
  const rows = await db.select().from(primerDesignRuns).where(eq(primerDesignRuns.runId, runId)).limit(1);
  return rows[0] ?? null;
}
async function deleteRunByTypeAndId(type, runId) {
  const db = await getDb();
  if (type === "optimization") {
    await db.delete(optimizationRuns).where(eq(optimizationRuns.runId, runId));
    return;
  }
  await db.delete(primerDesignRuns).where(eq(primerDesignRuns.runId, runId));
}
async function clearRuns(type) {
  const db = await getDb();
  if (type === "all" || type === "optimization") {
    await db.delete(optimizationRuns);
  }
  if (type === "all" || type === "primer_design") {
    await db.delete(primerDesignRuns);
  }
}

// server/codonTables.ts
var E_COLI_CODON_TABLE = {
  "A": { GCG: 0.36, GCA: 0.21, GCC: 0.27, GCT: 0.16 },
  "R": { CGT: 0.38, CGC: 0.36, CGA: 0.07, CGG: 0.1, AGA: 0.04, AGG: 0.02 },
  "N": { AAT: 0.45, AAC: 0.55 },
  "D": { GAT: 0.63, GAC: 0.37 },
  "C": { TGT: 0.45, TGC: 0.55 },
  "Q": { CAA: 0.34, CAG: 0.66 },
  "E": { GAA: 0.68, GAG: 0.32 },
  "G": { GGT: 0.35, GGC: 0.37, GGA: 0.13, GGG: 0.15 },
  "H": { CAT: 0.57, CAC: 0.43 },
  "I": { ATT: 0.49, ATC: 0.39, ATA: 0.11 },
  "L": { TTA: 0.13, TTG: 0.13, CTT: 0.12, CTC: 0.1, CTA: 0.04, CTG: 0.5 },
  "K": { AAA: 0.74, AAG: 0.26 },
  "M": { ATG: 1 },
  "F": { TTT: 0.57, TTC: 0.43 },
  "P": { CCT: 0.18, CCC: 0.13, CCA: 0.2, CCG: 0.49 },
  "S": { TCT: 0.17, TCC: 0.15, TCA: 0.14, TCG: 0.15, AGT: 0.16, AGC: 0.28 },
  "T": { ACT: 0.19, ACC: 0.4, ACA: 0.17, ACG: 0.25 },
  "W": { TGG: 1 },
  "Y": { TAT: 0.57, TAC: 0.43 },
  "V": { GTT: 0.28, GTC: 0.2, GTA: 0.17, GTG: 0.35 },
  "*": { TAA: 0.61, TAG: 0.09, TGA: 0.3 }
};
var S_CEREVISIAE_CODON_TABLE = {
  "A": { GCT: 0.38, GCC: 0.22, GCA: 0.29, GCG: 0.11 },
  "R": { AGA: 0.48, AGG: 0.21, CGA: 0.07, CGT: 0.14, CGC: 0.06, CGG: 0.04 },
  "N": { AAT: 0.59, AAC: 0.41 },
  "D": { GAT: 0.65, GAC: 0.35 },
  "C": { TGT: 0.63, TGC: 0.37 },
  "Q": { CAA: 0.69, CAG: 0.31 },
  "E": { GAA: 0.7, GAG: 0.3 },
  "G": { GGT: 0.47, GGC: 0.19, GGA: 0.22, GGG: 0.12 },
  "H": { CAT: 0.64, CAC: 0.36 },
  "I": { ATT: 0.46, ATC: 0.26, ATA: 0.27 },
  "L": { TTG: 0.28, TTA: 0.28, CTT: 0.13, CTC: 0.06, CTA: 0.14, CTG: 0.11 },
  "K": { AAA: 0.58, AAG: 0.42 },
  "M": { ATG: 1 },
  "F": { TTT: 0.59, TTC: 0.41 },
  "P": { CCT: 0.31, CCC: 0.15, CCA: 0.42, CCG: 0.12 },
  "S": { TCT: 0.26, TCC: 0.16, TCA: 0.21, TCG: 0.1, AGT: 0.16, AGC: 0.11 },
  "T": { ACT: 0.35, ACC: 0.22, ACA: 0.3, ACG: 0.14 },
  "W": { TGG: 1 },
  "Y": { TAT: 0.56, TAC: 0.44 },
  "V": { GTT: 0.39, GTC: 0.21, GTA: 0.21, GTG: 0.19 },
  "*": { TAA: 0.48, TAG: 0.24, TGA: 0.29 }
};
var H_SAPIENS_CODON_TABLE = {
  "A": { GCC: 0.4, GCT: 0.26, GCA: 0.23, GCG: 0.11 },
  "R": { CGC: 0.18, CGT: 0.08, AGA: 0.2, AGG: 0.2, CGA: 0.11, CGG: 0.21 },
  "N": { AAC: 0.54, AAT: 0.46 },
  "D": { GAC: 0.54, GAT: 0.46 },
  "C": { TGC: 0.55, TGT: 0.45 },
  "Q": { CAG: 0.73, CAA: 0.27 },
  "E": { GAG: 0.58, GAA: 0.42 },
  "G": { GGC: 0.34, GGG: 0.25, GGA: 0.25, GGT: 0.16 },
  "H": { CAC: 0.58, CAT: 0.42 },
  "I": { ATC: 0.48, ATT: 0.36, ATA: 0.16 },
  "L": { CTG: 0.41, CTC: 0.2, TTG: 0.13, CTT: 0.13, TTA: 0.07, CTA: 0.07 },
  "K": { AAG: 0.58, AAA: 0.42 },
  "M": { ATG: 1 },
  "F": { TTC: 0.55, TTT: 0.45 },
  "P": { CCC: 0.33, CCT: 0.28, CCA: 0.27, CCG: 0.11 },
  "S": { AGC: 0.24, TCC: 0.22, TCT: 0.18, TCA: 0.15, AGT: 0.15, TCG: 0.06 },
  "T": { ACC: 0.36, ACA: 0.28, ACT: 0.24, ACG: 0.12 },
  "W": { TGG: 1 },
  "Y": { TAC: 0.56, TAT: 0.44 },
  "V": { GTG: 0.47, GTC: 0.24, GTT: 0.18, GTA: 0.11 },
  "*": { TGA: 0.52, TAA: 0.3, TAG: 0.18 }
};
var INSECT_CODON_TABLE = {
  "A": { GCT: 0.3, GCC: 0.26, GCA: 0.26, GCG: 0.18 },
  "R": { AGA: 0.3, AGG: 0.34, CGT: 0.12, CGC: 0.08, CGA: 0.08, CGG: 0.08 },
  "N": { AAT: 0.48, AAC: 0.52 },
  "D": { GAT: 0.6, GAC: 0.4 },
  "C": { TGT: 0.42, TGC: 0.58 },
  "Q": { CAA: 0.4, CAG: 0.6 },
  "E": { GAA: 0.62, GAG: 0.38 },
  "G": { GGC: 0.38, GGT: 0.28, GGA: 0.18, GGG: 0.16 },
  "H": { CAT: 0.54, CAC: 0.46 },
  "I": { ATT: 0.42, ATC: 0.4, ATA: 0.18 },
  "L": { CTG: 0.38, TTG: 0.14, TTA: 0.12, CTT: 0.12, CTC: 0.14, CTA: 0.1 },
  "K": { AAG: 0.48, AAA: 0.52 },
  "M": { ATG: 1 },
  "F": { TTC: 0.56, TTT: 0.44 },
  "P": { CCA: 0.32, CCG: 0.3, CCT: 0.22, CCC: 0.16 },
  "S": { AGC: 0.22, TCC: 0.18, TCT: 0.16, TCA: 0.14, TCG: 0.14, AGT: 0.16 },
  "T": { ACC: 0.38, ACT: 0.2, ACA: 0.2, ACG: 0.22 },
  "W": { TGG: 1 },
  "Y": { TAC: 0.58, TAT: 0.42 },
  "V": { GTG: 0.32, GTC: 0.28, GTT: 0.24, GTA: 0.16 },
  "*": { TAA: 0.54, TAG: 0.14, TGA: 0.32 }
};
var PLANT_CODON_TABLE = {
  "A": { GCT: 0.36, GCA: 0.34, GCC: 0.18, GCG: 0.12 },
  "R": { AGA: 0.4, AGG: 0.16, CGA: 0.16, CGT: 0.12, CGG: 0.1, CGC: 0.06 },
  "N": { AAT: 0.48, AAC: 0.52 },
  "D": { GAT: 0.62, GAC: 0.38 },
  "C": { TGT: 0.46, TGC: 0.54 },
  "Q": { CAA: 0.54, CAG: 0.46 },
  "E": { GAA: 0.54, GAG: 0.46 },
  "G": { GGA: 0.36, GGT: 0.3, GGG: 0.18, GGC: 0.16 },
  "H": { CAT: 0.56, CAC: 0.44 },
  "I": { ATT: 0.48, ATC: 0.36, ATA: 0.16 },
  "L": { CTG: 0.38, TTG: 0.18, TTA: 0.14, CTT: 0.14, CTA: 0.08, CTC: 0.08 },
  "K": { AAG: 0.52, AAA: 0.48 },
  "M": { ATG: 1 },
  "F": { TTT: 0.5, TTC: 0.5 },
  "P": { CCA: 0.46, CCT: 0.22, CCG: 0.22, CCC: 0.1 },
  "S": { TCT: 0.2, AGC: 0.24, TCA: 0.16, AGT: 0.16, TCC: 0.14, TCG: 0.1 },
  "T": { ACA: 0.3, ACC: 0.3, ACT: 0.24, ACG: 0.16 },
  "W": { TGG: 1 },
  "Y": { TAT: 0.44, TAC: 0.56 },
  "V": { GTT: 0.28, GTA: 0.22, GTC: 0.22, GTG: 0.28 },
  "*": { TAA: 0.48, TAG: 0.2, TGA: 0.32 }
};
var CODON_TABLES = {
  "E. coli": E_COLI_CODON_TABLE,
  "S. cerevisiae": S_CEREVISIAE_CODON_TABLE,
  "H. sapiens": H_SAPIENS_CODON_TABLE,
  "insect": INSECT_CODON_TABLE,
  "plant": PLANT_CODON_TABLE
};
var HOST_TO_TABLE = {
  "E. coli": "E. coli",
  "E. coli K-12": "E. coli",
  "E. coli BL21": "E. coli",
  "B. subtilis": "E. coli",
  "S. cerevisiae": "S. cerevisiae",
  "P. pastoris": "S. cerevisiae",
  "K. lactis": "S. cerevisiae",
  "H. sapiens": "H. sapiens",
  "CHO": "H. sapiens",
  "HEK293": "H. sapiens",
  "HeLa": "H. sapiens",
  "Sf9": "insect",
  "Sf21": "insect",
  "High Five": "insect",
  "Arabidopsis": "plant",
  "N. benthamiana": "plant"
};

// server/codonOptimization.ts
var GENETIC_CODE = {
  TTT: "F",
  TTC: "F",
  TTA: "L",
  TTG: "L",
  TCT: "S",
  TCC: "S",
  TCA: "S",
  TCG: "S",
  TAT: "Y",
  TAC: "Y",
  TAA: "*",
  TAG: "*",
  TGT: "C",
  TGC: "C",
  TGA: "*",
  TGG: "W",
  CTT: "L",
  CTC: "L",
  CTA: "L",
  CTG: "L",
  CCT: "P",
  CCC: "P",
  CCA: "P",
  CCG: "P",
  CAT: "H",
  CAC: "H",
  CAA: "Q",
  CAG: "Q",
  CGT: "R",
  CGC: "R",
  CGA: "R",
  CGG: "R",
  ATT: "I",
  ATC: "I",
  ATA: "I",
  ATG: "M",
  ACT: "T",
  ACC: "T",
  ACA: "T",
  ACG: "T",
  AAT: "N",
  AAC: "N",
  AAA: "K",
  AAG: "K",
  AGT: "S",
  AGC: "S",
  AGA: "R",
  AGG: "R",
  GTT: "V",
  GTC: "V",
  GTA: "V",
  GTG: "V",
  GCT: "A",
  GCC: "A",
  GCA: "A",
  GCG: "A",
  GAT: "D",
  GAC: "D",
  GAA: "E",
  GAG: "E",
  GGT: "G",
  GGC: "G",
  GGA: "G",
  GGG: "G"
};
var MIN_ACCEPTABLE_CAI = 0.8;
var RAMP_WINDOW_CODONS = 40;
var LOW_FREQUENCY_THRESHOLD = 0.12;
var MIN_REPEAT_LENGTH = 9;
var DNA_COMPLEMENT = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
  N: "N"
};
var REQUIRED_AMINO_ACIDS = ["A", "R", "N", "D", "C", "Q", "E", "G", "H", "I", "L", "K", "M", "F", "P", "S", "T", "W", "Y", "V", "*"];
function toCodonTableObject(input) {
  if (!input) {
    throw new Error("\u5BC6\u7801\u5B50\u8868\u683C\u5F0F\u65E0\u6548\uFF1A\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input;
  }
  if (!Array.isArray(input)) {
    throw new Error("\u5BC6\u7801\u5B50\u8868\u683C\u5F0F\u65E0\u6548\uFF1A\u5FC5\u987B\u662F JSON \u5BF9\u8C61");
  }
  const out = {};
  for (const item of input) {
    if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && item[1] && typeof item[1] === "object") {
      out[item[0].toUpperCase()] = item[1];
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item;
    const aaRaw = row.aa ?? row.aminoAcid ?? row.amino_acid;
    if (typeof aaRaw !== "string") continue;
    const aa = aaRaw.toUpperCase();
    if (row.codons && typeof row.codons === "object" && !Array.isArray(row.codons)) {
      out[aa] = row.codons;
      continue;
    }
    const codonRaw = row.codon;
    const freqRaw = row.frequency ?? row.freq ?? row.weight ?? row.value;
    if (typeof codonRaw === "string" && freqRaw !== void 0) {
      if (!out[aa]) out[aa] = {};
      out[aa][codonRaw.toUpperCase()] = typeof freqRaw === "number" ? freqRaw : Number(freqRaw);
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error("\u5BC6\u7801\u5B50\u8868\u683C\u5F0F\u65E0\u6548\uFF1A\u6570\u7EC4\u5185\u5BB9\u65E0\u6CD5\u8F6C\u6362\u4E3A codon table");
  }
  return out;
}
function normalizeCodonTable(input) {
  const obj = toCodonTableObject(input);
  const normalized = {};
  for (const aa of REQUIRED_AMINO_ACIDS) {
    const row = obj[aa];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`\u5BC6\u7801\u5B50\u8868\u7F3A\u5C11\u6C28\u57FA\u9178 ${aa} \u7684\u5B9A\u4E49`);
    }
    const rowObj = row;
    const entries = Object.entries(rowObj);
    if (entries.length === 0) {
      throw new Error(`\u5BC6\u7801\u5B50\u8868\u4E2D\u6C28\u57FA\u9178 ${aa} \u6CA1\u6709\u53EF\u7528\u5BC6\u7801\u5B50`);
    }
    let sum = 0;
    const normalizedRow = {};
    for (const [codonRaw, freqRaw] of entries) {
      const codon = codonRaw.toUpperCase();
      if (!/^[ATCG]{3}$/.test(codon)) {
        throw new Error(`\u975E\u6CD5\u5BC6\u7801\u5B50\uFF1A${codonRaw}`);
      }
      const mappedAa = GENETIC_CODE[codon];
      if (!mappedAa || mappedAa !== aa) {
        throw new Error(`\u5BC6\u7801\u5B50 ${codon} \u4E0D\u5C5E\u4E8E\u6C28\u57FA\u9178 ${aa}`);
      }
      const freq = typeof freqRaw === "number" ? freqRaw : Number(freqRaw);
      if (!Number.isFinite(freq) || freq < 0) {
        throw new Error(`\u5BC6\u7801\u5B50 ${codon} \u7684\u9891\u7387\u65E0\u6548`);
      }
      normalizedRow[codon] = freq;
      sum += freq;
    }
    if (sum <= 0) {
      throw new Error(`\u6C28\u57FA\u9178 ${aa} \u7684\u9891\u7387\u603B\u548C\u5FC5\u987B\u5927\u4E8E 0`);
    }
    for (const codon of Object.keys(normalizedRow)) {
      normalizedRow[codon] = normalizedRow[codon] / sum;
    }
    normalized[aa] = normalizedRow;
  }
  return normalized;
}
function resolveCodonTable(hostSpecies2, codonTable) {
  if (codonTable) return normalizeCodonTable(codonTable);
  const builtIn = CODON_TABLES[hostSpecies2] ?? CODON_TABLES[HOST_TO_TABLE[hostSpecies2]];
  if (!builtIn) {
    throw new Error(`\u5BBF\u4E3B ${hostSpecies2} \u7F3A\u5C11\u5BC6\u7801\u5B50\u504F\u597D\u8868\uFF0C\u8BF7\u5148\u5728\u5BBF\u4E3B\u7BA1\u7406\u4E2D\u7EF4\u62A4 codon table`);
  }
  return builtIn;
}
function translateDNA(dna) {
  const cleanDNA = dna.toUpperCase().replace(/\s/g, "");
  let protein = "";
  for (let i = 0; i < cleanDNA.length - 2; i += 3) {
    const codon = cleanDNA.substring(i, i + 3);
    protein += GENETIC_CODE[codon] || "X";
  }
  return protein;
}
function calculateGC(sequence) {
  const gc = (sequence.match(/[GC]/gi) || []).length;
  return gc / sequence.length * 100;
}
function calculateCAI(sequence, codonTable) {
  const cleanSeq = sequence.toUpperCase().replace(/\s/g, "");
  let totalWeight = 0;
  let codonCount = 0;
  for (let i = 0; i < cleanSeq.length - 2; i += 3) {
    const codon = cleanSeq.substring(i, i + 3);
    const aa = GENETIC_CODE[codon];
    if (aa && aa !== "*" && codonTable[aa]) {
      const codonFreq = codonTable[aa][codon] || 0;
      const maxFreq = Math.max(...Object.values(codonTable[aa]));
      const relativeAdaptiveness = maxFreq > 0 ? codonFreq / maxFreq : 0;
      const safeWeight = Math.max(relativeAdaptiveness, 1e-6);
      totalWeight += Math.log(safeWeight);
      codonCount++;
    }
  }
  if (codonCount === 0) return 0;
  const cai = Math.exp(totalWeight / codonCount);
  return Math.min(1, cai);
}
function containsEnzymeSite(sequence, enzymeSite) {
  return sequence.toUpperCase().includes(enzymeSite.toUpperCase());
}
function normalizeRestrictionSites(sites = []) {
  return Array.from(
    new Set(
      sites.map((site) => site.toUpperCase().replace(/\s/g, "").trim()).filter(Boolean)
    )
  );
}
function countRestrictionSiteOccurrences(sequence, enzymeSite) {
  const cleanSequence = sequence.toUpperCase().replace(/\s/g, "");
  const cleanSite = enzymeSite.toUpperCase().replace(/\s/g, "").trim();
  if (!cleanSequence || !cleanSite) return 0;
  let count = 0;
  let searchFrom = 0;
  while (searchFrom <= cleanSequence.length - cleanSite.length) {
    const foundAt = cleanSequence.indexOf(cleanSite, searchFrom);
    if (foundAt === -1) break;
    count += 1;
    searchFrom = foundAt + 1;
  }
  return count;
}
function buildRetainConstraint(sourceDnaSequence, retainEnzymes = []) {
  const cleanSource = sourceDnaSequence.toUpperCase().replace(/\s/g, "");
  const normalizedSites = normalizeRestrictionSites(retainEnzymes);
  const protectedCodonIndexes = /* @__PURE__ */ new Set();
  const expectedSiteCounts = {};
  const missingSites = [];
  for (const site of normalizedSites) {
    let found = 0;
    let searchFrom = 0;
    while (searchFrom <= cleanSource.length - site.length) {
      const foundAt = cleanSource.indexOf(site, searchFrom);
      if (foundAt === -1) break;
      found += 1;
      const codonStart = Math.floor(foundAt / 3);
      const codonEnd = Math.floor((foundAt + site.length - 1) / 3);
      for (let codonIndex = codonStart; codonIndex <= codonEnd; codonIndex += 1) {
        protectedCodonIndexes.add(codonIndex);
      }
      searchFrom = foundAt + 1;
    }
    expectedSiteCounts[site] = found;
    if (found === 0) {
      missingSites.push(site);
    }
  }
  return {
    normalizedSites,
    protectedCodonIndexes: Array.from(protectedCodonIndexes).sort((a, b) => a - b),
    missingSites,
    expectedSiteCounts
  };
}
function restoreProtectedCodons(sourceDnaSequence, candidateSequence, protectedCodonIndexes) {
  const source = sourceDnaSequence.toUpperCase().replace(/\s/g, "");
  const candidate = candidateSequence.toUpperCase().replace(/\s/g, "");
  let restored = candidate;
  for (const codonIndex of protectedCodonIndexes) {
    const start = codonIndex * 3;
    if (start + 3 > source.length || start + 3 > restored.length) continue;
    restored = restored.slice(0, start) + source.slice(start, start + 3) + restored.slice(start + 3);
  }
  return restored;
}
function reverseComplement(sequence) {
  return sequence.toUpperCase().split("").reverse().map((nt) => DNA_COMPLEMENT[nt] ?? "N").join("");
}
function complement(nt) {
  return DNA_COMPLEMENT[nt.toUpperCase()] ?? "N";
}
function analyzeRepeatStats(sequence, minLength = MIN_REPEAT_LENGTH) {
  const seq = sequence.toUpperCase();
  const pairs = [];
  const seen = /* @__PURE__ */ new Set();
  for (let i = 0; i <= seq.length - minLength; i++) {
    for (let j = i + 1; j <= seq.length - minLength; j++) {
      let length = 0;
      while (i + length < seq.length && j + length < seq.length && seq[i + length] === seq[j + length]) {
        length += 1;
      }
      if (length < minLength) continue;
      if (i > 0 && j > 0 && seq[i - 1] === seq[j - 1]) continue;
      const key = `DR:${i}:${j}:${length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        type: "DR",
        position1: i + 1,
        position2: j + 1,
        length,
        sequence1: seq.slice(i, i + length),
        sequence2: seq.slice(j, j + length)
      });
    }
  }
  for (let i = 0; i <= seq.length - minLength; i++) {
    for (let end2 = i + minLength - 1; end2 < seq.length; end2++) {
      let length = 0;
      while (i + length < seq.length && end2 - length >= 0 && seq[i + length] === complement(seq[end2 - length])) {
        length += 1;
      }
      if (length < minLength) continue;
      const start2 = end2 - length + 1;
      if (start2 < i) continue;
      if (i > 0 && end2 + 1 < seq.length && seq[i - 1] === complement(seq[end2 + 1])) continue;
      const type = start2 === i ? "PR" : "IR";
      const sequence1 = seq.slice(i, i + length);
      const sequence2 = seq.slice(start2, start2 + length);
      const key = `${type}:${i}:${start2}:${length}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({
        type,
        position1: i + 1,
        position2: start2 + 1,
        length,
        sequence1,
        sequence2: reverseComplement(sequence2)
      });
    }
  }
  pairs.sort((a, b) => {
    if (a.position1 !== b.position1) return a.position1 - b.position1;
    if (a.position2 !== b.position2) return a.position2 - b.position2;
    return b.length - a.length;
  });
  const direct = pairs.filter((pair) => pair.type === "DR").length;
  const inverted = pairs.filter((pair) => pair.type === "IR").length;
  const palindromic = pairs.filter((pair) => pair.type === "PR").length;
  return {
    minLength,
    total: pairs.length,
    direct,
    inverted,
    palindromic,
    maxLength: pairs.reduce((max, pair) => Math.max(max, pair.length), 0),
    pairs
  };
}
function getCodonWeight(aa, codon, codonTable) {
  if (!codonTable[aa]) return 0;
  return codonTable[aa][codon] || 0;
}
function codonMatchesAminoAcid(codon, aa) {
  return GENETIC_CODE[codon.toUpperCase()] === aa;
}
function canUseCodon(codon, currentSequence, avoidSites, targetGC) {
  const testSeq = currentSequence + codon;
  for (const site of avoidSites) {
    if (testSeq.slice(-site.length - 3).includes(site)) {
      return false;
    }
  }
  if (targetGC) {
    const gc = calculateGC(codon);
    if (gc < targetGC.min || gc > targetGC.max) {
      return false;
    }
  }
  return true;
}
function getConsecutiveRareCodons(currentSequence, codonTable) {
  let count = 0;
  for (let i = currentSequence.length - 3; i >= 0; i -= 3) {
    const codon = currentSequence.slice(i, i + 3);
    const aa = GENETIC_CODE[codon];
    if (!aa || aa === "*" || !codonTable[aa]) break;
    const w = getCodonWeight(aa, codon, codonTable);
    if (w < LOW_FREQUENCY_THRESHOLD) {
      count++;
      continue;
    }
    break;
  }
  return count;
}
function localGcAt5Prime(testSeq) {
  const window = testSeq.slice(0, Math.min(90, testSeq.length));
  return calculateGC(window);
}
function selectCodon(aa, codonTable, avoidSites = [], currentSequence = "", targetGC, codonIndex = 0) {
  if (!codonTable[aa]) {
    return "NNN";
  }
  const codons = codonTable[aa];
  const codonList = Object.entries(codons).sort((a, b) => b[1] - a[1]);
  const rareStreak = getConsecutiveRareCodons(currentSequence, codonTable);
  const isRampRegion = codonIndex < RAMP_WINDOW_CODONS;
  const rampCandidates = isRampRegion ? codonList.filter(([, w]) => w >= 0.2 && w <= 0.6) : codonList;
  const candidates = rampCandidates.length ? rampCandidates : codonList;
  for (const [codon, weight] of candidates) {
    if (rareStreak >= 2 && weight < LOW_FREQUENCY_THRESHOLD) continue;
    if (!canUseCodon(codon, currentSequence, avoidSites, targetGC)) continue;
    const testSeq = currentSequence + codon;
    if (isRampRegion) {
      const localGC = localGcAt5Prime(testSeq);
      if (localGC < 35 || localGC > 70) continue;
    }
    return codon;
  }
  for (const [codon] of codonList) {
    if (canUseCodon(codon, currentSequence, avoidSites, targetGC)) return codon;
  }
  return codonList[0][0];
}
function enforceMinimumCAI(optimizedSequence, protein, codonTable, avoidSites = [], targetGC, protectedCodonIndexes = /* @__PURE__ */ new Set()) {
  let best = optimizedSequence.toUpperCase();
  let bestCai = calculateCAI(best, codonTable);
  if (bestCai >= MIN_ACCEPTABLE_CAI) return best;
  const positions = Array.from({ length: protein.length }, (_, i) => i).filter((i) => protein[i] !== "*" && !!codonTable[protein[i]] && !protectedCodonIndexes.has(i)).sort((a, b) => {
    const codonA = best.slice(a * 3, a * 3 + 3);
    const codonB = best.slice(b * 3, b * 3 + 3);
    const wA = getCodonWeight(protein[a], codonA, codonTable);
    const wB = getCodonWeight(protein[b], codonB, codonTable);
    return wA - wB;
  });
  for (const pos of positions) {
    const aa = protein[pos];
    const currentCodon = best.slice(pos * 3, pos * 3 + 3);
    const options = Object.entries(codonTable[aa]).sort((a, b) => b[1] - a[1]);
    for (const [candidate, candidateWeight] of options) {
      const currentWeight = getCodonWeight(aa, currentCodon, codonTable);
      if (candidateWeight <= currentWeight || candidate === currentCodon) continue;
      const replaced = best.slice(0, pos * 3) + candidate + best.slice(pos * 3 + 3);
      if (!avoidSites.every((site) => !containsEnzymeSite(replaced, site))) continue;
      if (targetGC) {
        const gc = calculateGC(replaced);
        if (gc < targetGC.min || gc > targetGC.max) continue;
      }
      const cai = calculateCAI(replaced, codonTable);
      if (cai > bestCai) {
        best = replaced;
        bestCai = cai;
      }
      if (bestCai >= MIN_ACCEPTABLE_CAI) return best;
    }
  }
  return best;
}
function raiseCaiAboveThreshold(dnaSequence, params) {
  const codonTable = resolveCodonTable(params.hostSpecies, params.codonTable);
  const clean = dnaSequence.toUpperCase().replace(/\s/g, "");
  const protein = translateDNA(clean);
  const targetGC = params.targetGcMin !== void 0 && params.targetGcMax !== void 0 ? { min: params.targetGcMin, max: params.targetGcMax } : void 0;
  const protectedCodonIndexes = new Set(params.protectedCodonIndexes ?? []);
  return enforceMinimumCAI(clean, protein, codonTable, params.avoidEnzymes ?? [], targetGC, protectedCodonIndexes);
}
function optimizeSequence(dnaSequence, params) {
  const { hostSpecies: hostSpecies2, avoidEnzymes = [], retainEnzymes = [], targetGcMin, targetGcMax, eliminateRepeats = true } = params;
  const codonTable = resolveCodonTable(hostSpecies2, params.codonTable);
  const sourceDnaSequence = (params.sourceDnaSequence ?? dnaSequence).toUpperCase().replace(/\s/g, "");
  const retainConstraint = buildRetainConstraint(sourceDnaSequence, retainEnzymes);
  const protectedCodonIndexes = new Set(retainConstraint.protectedCodonIndexes);
  const protein = translateDNA(dnaSequence);
  let optimized = "";
  const warnings = [];
  let changes = 0;
  const targetGC = targetGcMin !== void 0 && targetGcMax !== void 0 ? { min: targetGcMin, max: targetGcMax } : void 0;
  for (let i = 0; i < protein.length; i++) {
    const aa = protein[i];
    const sourceCodon = sourceDnaSequence.substring(i * 3, i * 3 + 3).toUpperCase();
    if (aa === "*") {
      if (protectedCodonIndexes.has(i) && sourceCodon.length === 3 && codonMatchesAminoAcid(sourceCodon, aa)) {
        optimized += sourceCodon;
      } else {
        optimized += "TAA";
      }
      continue;
    }
    const originalCodon = dnaSequence.substring(i * 3, i * 3 + 3).toUpperCase();
    const newCodon = protectedCodonIndexes.has(i) && sourceCodon.length === 3 && codonMatchesAminoAcid(sourceCodon, aa) ? sourceCodon : selectCodon(aa, codonTable, avoidEnzymes, optimized, targetGC, i);
    if (newCodon !== originalCodon) {
      changes++;
    }
    optimized += newCodon;
  }
  for (const enzyme of avoidEnzymes) {
    if (containsEnzymeSite(optimized, enzyme)) {
      warnings.push(`\u8B66\u544A: \u4F18\u5316\u540E\u7684\u5E8F\u5217\u4ECD\u5305\u542B\u9650\u5236\u6027\u9176\u5207\u4F4D\u70B9 ${enzyme}`);
    }
  }
  for (const site of retainConstraint.missingSites) {
    warnings.push(`\u8B66\u544A: \u539F\u59CBDNA\u5E8F\u5217\u4E2D\u672A\u627E\u5230\u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9 ${site}\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u7EA6\u675F`);
  }
  optimized = enforceMinimumCAI(optimized, protein, codonTable, avoidEnzymes, targetGC, protectedCodonIndexes);
  optimized = restoreProtectedCodons(sourceDnaSequence, optimized, retainConstraint.protectedCodonIndexes);
  for (const site of retainConstraint.normalizedSites) {
    const expectedCount = retainConstraint.expectedSiteCounts[site] ?? 0;
    if (expectedCount === 0) continue;
    const actualCount = countRestrictionSiteOccurrences(optimized, site);
    if (actualCount < expectedCount) {
      warnings.push(`\u8B66\u544A: \u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9 ${site} \u672A\u88AB\u5B8C\u6574\u4FDD\u7559\uFF08\u539F\u59CB ${expectedCount} \u5904\uFF0C\u5F53\u524D ${actualCount} \u5904\uFF09`);
    }
  }
  const cai = calculateCAI(optimized, codonTable);
  const gcContent = calculateGC(optimized);
  const repeatStats = analyzeRepeatStats(optimized);
  if (eliminateRepeats && repeatStats.total > 0) {
    warnings.push(
      `\u68C0\u6D4B\u5230 ${repeatStats.total} \u4E2A\u91CD\u590D\u5E8F\u5217\u533A\u57DF\uFF08DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}\uFF09`
    );
  }
  if (cai < MIN_ACCEPTABLE_CAI) {
    throw new Error(`\u4F18\u5316\u540E CAI ${cai.toFixed(3)} \u4F4E\u4E8E\u9608\u503C ${MIN_ACCEPTABLE_CAI}`);
  }
  if (targetGcMin !== void 0 && gcContent < targetGcMin) {
    warnings.push(`GC\u542B\u91CF (${gcContent.toFixed(1)}%) \u4F4E\u4E8E\u76EE\u6807\u6700\u5C0F\u503C (${targetGcMin}%)`);
  }
  if (targetGcMax !== void 0 && gcContent > targetGcMax) {
    warnings.push(`GC\u542B\u91CF (${gcContent.toFixed(1)}%) \u9AD8\u4E8E\u76EE\u6807\u6700\u5927\u503C (${targetGcMax}%)`);
  }
  return {
    optimizedSequence: optimized,
    cai: Math.round(cai * 1e3) / 1e3,
    gcContent: Math.round(gcContent * 10) / 10,
    changes,
    warnings,
    repeatStats
  };
}
function optimizeProteinSequence(proteinSequence, params) {
  const { hostSpecies: hostSpecies2, avoidEnzymes = [], retainEnzymes = [], targetGcMin, targetGcMax, eliminateRepeats = true } = params;
  const codonTable = resolveCodonTable(hostSpecies2, params.codonTable);
  const protein = proteinSequence.toUpperCase().replace(/\s/g, "");
  if (!/^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(protein)) {
    throw new Error("Invalid amino acid sequence: use single-letter codes (ACDEFGHIKLMNPQRSTVWY*)");
  }
  let optimized = "";
  const warnings = [];
  if (retainEnzymes.length > 0) {
    warnings.push("\u8B66\u544A: \u86CB\u767D\u5E8F\u5217\u8F93\u5165\u65E0\u6CD5\u8BC6\u522B\u539F\u59CBDNA\u4E2D\u7684\u9176\u5207\u4F4D\u70B9\uFF0C\u5DF2\u5FFD\u7565\u201C\u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9\u201D\u7EA6\u675F");
  }
  const targetGC = targetGcMin !== void 0 && targetGcMax !== void 0 ? { min: targetGcMin, max: targetGcMax } : void 0;
  for (let i = 0; i < protein.length; i++) {
    const aa = protein[i];
    if (aa === "*") {
      optimized += "TAA";
      continue;
    }
    const codon = selectCodon(aa, codonTable, avoidEnzymes, optimized, targetGC, i);
    optimized += codon;
  }
  for (const enzyme of avoidEnzymes) {
    if (containsEnzymeSite(optimized, enzyme)) {
      warnings.push(`\u8B66\u544A: \u4F18\u5316\u540E\u7684\u5E8F\u5217\u4ECD\u5305\u542B\u9650\u5236\u6027\u9176\u5207\u4F4D\u70B9 ${enzyme}`);
    }
  }
  optimized = enforceMinimumCAI(optimized, protein, codonTable, avoidEnzymes, targetGC);
  const cai = calculateCAI(optimized, codonTable);
  const gcContent = calculateGC(optimized);
  const repeatStats = analyzeRepeatStats(optimized);
  if (eliminateRepeats && repeatStats.total > 0) {
    warnings.push(
      `\u68C0\u6D4B\u5230 ${repeatStats.total} \u4E2A\u91CD\u590D\u5E8F\u5217\u533A\u57DF\uFF08DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}\uFF09`
    );
  }
  if (cai < MIN_ACCEPTABLE_CAI) {
    throw new Error(`\u4F18\u5316\u540E CAI ${cai.toFixed(3)} \u4F4E\u4E8E\u9608\u503C ${MIN_ACCEPTABLE_CAI}`);
  }
  if (targetGcMin !== void 0 && gcContent < targetGcMin) {
    warnings.push(`GC\u542B\u91CF (${gcContent.toFixed(1)}%) \u4F4E\u4E8E\u76EE\u6807\u6700\u5C0F\u503C (${targetGcMin}%)`);
  }
  if (targetGcMax !== void 0 && gcContent > targetGcMax) {
    warnings.push(`GC\u542B\u91CF (${gcContent.toFixed(1)}%) \u9AD8\u4E8E\u76EE\u6807\u6700\u5927\u503C (${targetGcMax}%)`);
  }
  return {
    optimizedSequence: optimized,
    cai: Math.round(cai * 1e3) / 1e3,
    gcContent: Math.round(gcContent * 10) / 10,
    changes: protein.length,
    // 全部为新选择
    warnings,
    repeatStats
  };
}
function optimizeSequenceAuto(sequence, params) {
  const cleanSeq = sequence.toUpperCase().replace(/\s/g, "");
  const isProtein = /^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(cleanSeq);
  const isDNA = /^[ATCGN]+$/.test(cleanSeq);
  if (isProtein) {
    return optimizeProteinSequence(cleanSeq, params);
  }
  if (isDNA) {
    return optimizeSequence(cleanSeq, params);
  }
  throw new Error("Invalid sequence: must be DNA (ATCGN) or protein (ACDEFGHIKLMNPQRSTVWY*)");
}
function scoreDnaSequence(dnaSequence, hostSpecies2, codonTable) {
  const cleanSeq = dnaSequence.toUpperCase().replace(/\s/g, "");
  const table = resolveCodonTable(hostSpecies2, codonTable);
  const cai = calculateCAI(cleanSeq, table);
  const gcContent = calculateGC(cleanSeq);
  return {
    cai: Math.round(cai * 1e3) / 1e3,
    gcContent: Math.round(gcContent * 10) / 10,
    warnings: []
  };
}
function analyzeCodonUsage(dnaSequence) {
  const cleanSeq = dnaSequence.toUpperCase().replace(/\s/g, "");
  const usage = {};
  for (let i = 0; i < cleanSeq.length - 2; i += 3) {
    const codon = cleanSeq.substring(i, i + 3);
    const aa = GENETIC_CODE[codon];
    if (aa) {
      if (!usage[aa]) {
        usage[aa] = {};
      }
      usage[aa][codon] = (usage[aa][codon] || 0) + 1;
    }
  }
  for (const aa in usage) {
    const total = Object.values(usage[aa]).reduce((sum, count) => sum + count, 0);
    for (const codon in usage[aa]) {
      usage[aa][codon] = usage[aa][codon] / total;
    }
  }
  return usage;
}

// server/codonOptimizationStrategy.ts
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path2 from "node:path";

// server/_core/env.ts
var ENV = {
  get cookieSecret() {
    return process.env.JWT_SECRET ?? "";
  },
  get databaseUrl() {
    return process.env.DATABASE_URL ?? "";
  },
  get ownerOpenId() {
    return process.env.OWNER_OPEN_ID ?? "";
  },
  get isProduction() {
    return process.env.NODE_ENV === "production";
  },
  get forgeApiUrl() {
    return process.env.BUILT_IN_FORGE_API_URL ?? "";
  },
  get forgeApiKey() {
    return process.env.BUILT_IN_FORGE_API_KEY ?? "";
  },
  get dnaWorksExecutablePath() {
    return process.env.DNAWORKS_EXECUTABLE_PATH ?? "";
  },
  get dnaWorksWorkdir() {
    return process.env.DNAWORKS_WORKDIR ?? "";
  }
};

// server/codonOptimizationStrategy.ts
var MIN_ACCEPTABLE_CAI2 = 0.8;
var GENETIC_CODE2 = {
  TTT: "F",
  TTC: "F",
  TTA: "L",
  TTG: "L",
  TCT: "S",
  TCC: "S",
  TCA: "S",
  TCG: "S",
  TAT: "Y",
  TAC: "Y",
  TAA: "*",
  TAG: "*",
  TGT: "C",
  TGC: "C",
  TGA: "*",
  TGG: "W",
  CTT: "L",
  CTC: "L",
  CTA: "L",
  CTG: "L",
  CCT: "P",
  CCC: "P",
  CCA: "P",
  CCG: "P",
  CAT: "H",
  CAC: "H",
  CAA: "Q",
  CAG: "Q",
  CGT: "R",
  CGC: "R",
  CGA: "R",
  CGG: "R",
  ATT: "I",
  ATC: "I",
  ATA: "I",
  ATG: "M",
  ACT: "T",
  ACC: "T",
  ACA: "T",
  ACG: "T",
  AAT: "N",
  AAC: "N",
  AAA: "K",
  AAG: "K",
  AGT: "S",
  AGC: "S",
  AGA: "R",
  AGG: "R",
  GTT: "V",
  GTC: "V",
  GTA: "V",
  GTG: "V",
  GCT: "A",
  GCC: "A",
  GCA: "A",
  GCG: "A",
  GAT: "D",
  GAC: "D",
  GAA: "E",
  GAG: "E",
  GGT: "G",
  GGC: "G",
  GGA: "G",
  GGG: "G"
};
var AA_TO_CODONS = Object.entries(GENETIC_CODE2).reduce((acc, [codon, aa]) => {
  if (!acc[aa]) acc[aa] = [];
  acc[aa].push(codon);
  return acc;
}, {});
function calculateRepeatPenalty(sequence) {
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  const minRepeatLength = 9;
  if (clean.length < minRepeatLength) return 0;
  const complement2 = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  const rc = (s) => s.split("").reverse().map((b) => complement2[b] || b).join("");
  const canonical = (s) => {
    const reversed = rc(s);
    return s <= reversed ? s : reversed;
  };
  const count = /* @__PURE__ */ new Map();
  const windows = [];
  for (let i = 0; i <= clean.length - minRepeatLength; i++) {
    const key = canonical(clean.slice(i, i + minRepeatLength));
    windows.push({ start: i, key });
    count.set(key, (count.get(key) || 0) + 1);
  }
  const mask = new Array(clean.length).fill(false);
  for (const window of windows) {
    if ((count.get(window.key) || 0) < 2) continue;
    for (let p = window.start; p < window.start + minRepeatLength; p++) {
      mask[p] = true;
    }
  }
  const repeatedBases = mask.reduce((sum, flagged) => sum + (flagged ? 1 : 0), 0);
  return Math.min(1, repeatedBases / clean.length);
}
function hasAvoidEnzymeSite(sequence, avoidEnzymes = []) {
  if (!avoidEnzymes.length) return false;
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  return avoidEnzymes.some((site) => {
    const normalized = (site || "").toUpperCase().trim();
    return normalized ? clean.includes(normalized) : false;
  });
}
function collectRepeatHotspotCodonIndexes(sequence) {
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  const minRepeatLength = 9;
  if (clean.length < minRepeatLength) return [];
  const complement2 = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  const rc = (s) => s.split("").reverse().map((b) => complement2[b] || b).join("");
  const canonical = (s) => {
    const reversed = rc(s);
    return s <= reversed ? s : reversed;
  };
  const count = /* @__PURE__ */ new Map();
  const windows = [];
  for (let i = 0; i <= clean.length - minRepeatLength; i++) {
    const key = canonical(clean.slice(i, i + minRepeatLength));
    windows.push({ start: i, key });
    count.set(key, (count.get(key) || 0) + 1);
  }
  const hotspotCodons = /* @__PURE__ */ new Set();
  for (const window of windows) {
    if ((count.get(window.key) || 0) < 2) continue;
    const codonStart = Math.floor(window.start / 3);
    const codonEnd = Math.floor((window.start + minRepeatLength - 1) / 3);
    for (let index = codonStart; index <= codonEnd; index++) {
      hotspotCodons.add(index);
    }
  }
  return Array.from(hotspotCodons).sort((a, b) => a - b);
}
function replaceCodonAt(sequence, codonIndex, codon) {
  const start = codonIndex * 3;
  return sequence.slice(0, start) + codon + sequence.slice(start + 3);
}
function polishRepeats(sequence, params) {
  if (params.eliminateRepeats === false) {
    return { sequence, changed: false };
  }
  const baseline = scoreDnaSequence(sequence, params.hostSpecies, params.codonTable);
  let bestSequence = sequence.toUpperCase().replace(/\s/g, "");
  let bestPenalty = calculateRepeatPenalty(bestSequence);
  let bestCai = baseline.cai;
  const baselineHasAvoid = hasAvoidEnzymeSite(bestSequence, params.avoidEnzymes || []);
  const protectedCodonIndexes = new Set(
    params.sourceDnaSequence ? buildRetainConstraint(params.sourceDnaSequence, params.retainEnzymes).protectedCodonIndexes : []
  );
  if (bestPenalty <= 0) {
    return { sequence, changed: false };
  }
  try {
    const polished = optimizeSequence(bestSequence, {
      hostSpecies: params.hostSpecies,
      codonTable: params.codonTable,
      avoidEnzymes: params.avoidEnzymes,
      targetGcMin: params.targetGcMin,
      targetGcMax: params.targetGcMax,
      eliminateRepeats: true
    }).optimizedSequence;
    const polishedPenalty = calculateRepeatPenalty(polished);
    if (polishedPenalty < bestPenalty) {
      bestSequence = polished;
      bestPenalty = polishedPenalty;
      bestCai = scoreDnaSequence(bestSequence, params.hostSpecies, params.codonTable).cai;
    }
  } catch {
  }
  const minPolishCai = 0.8;
  const maxIterations = Math.min(300, Math.max(80, Math.floor(bestSequence.length / 6)));
  let stall = 0;
  for (let iteration = 0; iteration < maxIterations && stall < 50; iteration++) {
    const hotspots = collectRepeatHotspotCodonIndexes(bestSequence);
    if (!hotspots.length) break;
    let improved = false;
    for (const codonIndex of hotspots) {
      if (protectedCodonIndexes.has(codonIndex)) continue;
      const start = codonIndex * 3;
      if (start + 3 > bestSequence.length) continue;
      const currentCodon = bestSequence.slice(start, start + 3);
      const aa = GENETIC_CODE2[currentCodon];
      if (!aa || aa === "*") continue;
      const candidates = (AA_TO_CODONS[aa] || []).filter((candidate) => candidate !== currentCodon);
      if (!candidates.length) continue;
      let localBestSequence = null;
      let localBestPenalty = bestPenalty;
      let localBestCai = bestCai;
      for (const candidate of candidates) {
        const mutated = replaceCodonAt(bestSequence, codonIndex, candidate);
        if (baselineHasAvoid && hasAvoidEnzymeSite(mutated, params.avoidEnzymes || [])) {
        } else if (!baselineHasAvoid && hasAvoidEnzymeSite(mutated, params.avoidEnzymes || [])) {
          continue;
        }
        const penalty = calculateRepeatPenalty(mutated);
        if (penalty > localBestPenalty + 1e-9) continue;
        const cai = scoreDnaSequence(mutated, params.hostSpecies, params.codonTable).cai;
        if (cai < minPolishCai) continue;
        const betterPenalty = penalty < localBestPenalty - 1e-9;
        const betterCaiOnTie = Math.abs(penalty - localBestPenalty) <= 1e-9 && cai > localBestCai + 1e-9;
        if (betterPenalty || betterCaiOnTie) {
          localBestSequence = mutated;
          localBestPenalty = penalty;
          localBestCai = cai;
        }
      }
      if (localBestSequence) {
        bestSequence = localBestSequence;
        bestPenalty = localBestPenalty;
        bestCai = localBestCai;
        improved = true;
        break;
      }
    }
    if (improved) {
      stall = 0;
    } else {
      stall++;
    }
  }
  const beforePenalty = calculateRepeatPenalty(sequence);
  if (bestPenalty < beforePenalty - 1e-9) {
    return {
      sequence: bestSequence,
      changed: true,
      note: `\u91CD\u590D\u5E8F\u5217\u7CBE\u4FEE\uFF1A\u60E9\u7F5A ${beforePenalty.toFixed(3)} -> ${bestPenalty.toFixed(3)}\uFF0CCAI ${baseline.cai.toFixed(3)} -> ${bestCai.toFixed(3)}`
    };
  }
  return { sequence, changed: false };
}
function countCodonChanges(source, target) {
  const cleanSource = source.toUpperCase().replace(/\s/g, "");
  const cleanTarget = target.toUpperCase().replace(/\s/g, "");
  const codonCount = Math.floor(Math.min(cleanSource.length, cleanTarget.length) / 3);
  let changes = 0;
  for (let i = 0; i < codonCount; i++) {
    if (cleanSource.slice(i * 3, i * 3 + 3) !== cleanTarget.slice(i * 3, i * 3 + 3)) {
      changes++;
    }
  }
  return changes;
}
function runExecFile(command, args, cwd) {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}
function extractOptimizedDna(content) {
  const rawLines = content.split(/\r?\n/);
  const sequences = [];
  for (let i = 0; i < rawLines.length; i++) {
    if (!/THE DNA SEQUENCE #\s*\d+\s+IS:/i.test(rawLines[i])) continue;
    let collected = "";
    let started = false;
    for (let j = i + 1; j < rawLines.length; j++) {
      const line = rawLines[j];
      const match = line.match(/^\s*\d+\s+([ATCG\s]+)$/i);
      if (match) {
        started = true;
        collected += match[1].replace(/[^ATCG]/gi, "");
        continue;
      }
      if (started) break;
    }
    if (collected) {
      sequences.push(collected.toUpperCase());
    }
  }
  if (!sequences.length) return null;
  const candidate = sequences.sort((a, b) => b.length - a.length).at(0);
  if (!candidate) return null;
  return candidate.length % 3 === 0 ? candidate : candidate.slice(0, candidate.length - candidate.length % 3);
}
function wrapSequence(sequence, width = 60) {
  const chunks = [];
  for (let i = 0; i < sequence.length; i += width) {
    chunks.push(sequence.slice(i, i + width));
  }
  return chunks.join("\n");
}
function buildInputTemplate(sequence) {
  return [
    'title "CODON_TOOLS_DNAWORKS"',
    'logfile "LOGFILE.txt"',
    "timelimit 30",
    "solutions 1",
    "NUCLEOTIDE",
    wrapSequence(sequence),
    "//",
    ""
  ].join("\n");
}
async function runDNAWorks(sequence, params) {
  const executable = ENV.dnaWorksExecutablePath;
  if (!executable || !existsSync(executable)) {
    throw new Error("DNAWorks \u672A\u914D\u7F6E\uFF0C\u8BF7\u8BBE\u7F6E DNAWORKS_EXECUTABLE_PATH \u6307\u5411 dnaworks \u53EF\u6267\u884C\u6587\u4EF6");
  }
  const runDir = path2.join(ENV.dnaWorksWorkdir || os.tmpdir(), `dnaworks-${randomUUID()}`);
  await fs.mkdir(runDir, { recursive: true });
  try {
    const clean = sequence.toUpperCase().replace(/\s/g, "");
    const isProtein = /^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(clean);
    const isDna = /^[ATCGN]+$/.test(clean);
    if (!isProtein && !isDna) {
      throw new Error("\u5E8F\u5217\u683C\u5F0F\u65E0\u6548\uFF0C\u5FC5\u987B\u662F DNA \u6216\u86CB\u767D\u5E8F\u5217");
    }
    const effectiveParams = isDna ? { ...params, sourceDnaSequence: clean } : params;
    const dnaInput = isProtein ? optimizeSequenceAuto(clean, effectiveParams).optimizedSequence : clean;
    const expectedMinLength = isProtein ? clean.replace(/\*/g, "").length * 3 : 0;
    if (dnaInput.length < 50) {
      throw new Error("DNAWorks \u8981\u6C42 DNA \u5E8F\u5217\u957F\u5EA6\u81F3\u5C11\u4E3A 50 nt\uFF0C\u5F53\u524D\u5E8F\u5217\u8FC7\u77ED");
    }
    const inputPath = path2.join(runDir, "DNAWORKS.inp");
    const logfilePath = path2.join(runDir, "LOGFILE.txt");
    await fs.writeFile(inputPath, buildInputTemplate(dnaInput), "utf8");
    const { stdout, stderr } = await runExecFile(executable, ["DNAWORKS.inp"], runDir);
    const logContent = existsSync(logfilePath) ? await fs.readFile(logfilePath, "utf8") : "";
    const fort10Path = path2.join(runDir, "fort.10");
    const fort10Content = existsSync(fort10Path) ? await fs.readFile(fort10Path, "utf8") : "";
    const optimized = extractOptimizedDna(logContent);
    if (!optimized) {
      const errorText = [stdout, stderr, fort10Content, logContent].filter(Boolean).join("\n");
      if (errorText.includes("DNA length is less than 50 nt")) {
        throw new Error("DNAWorks \u8981\u6C42 DNA \u5E8F\u5217\u957F\u5EA6\u81F3\u5C11\u4E3A 50 nt\uFF0C\u5F53\u524D\u5E8F\u5217\u8FC7\u77ED");
      }
      if (errorText.includes("Too many misprimes")) {
        throw new Error("DNAWorks \u5728\u8BE5\u5E8F\u5217\u4E0A\u68C0\u6D4B\u5230\u8FC7\u591A misprimes\uFF08\u4EA4\u53C9\u9519\u914D\uFF09\uFF0C\u672A\u80FD\u751F\u6210\u53EF\u89E3\u6298\u65B9\u6848\u3002\u8BE5\u5E8F\u5217\u91CD\u590D\u6A21\u5757\u8F83\u591A\uFF0C\u5F53\u524D\u56FA\u5B9A DNA \u8F93\u5165\u4F1A\u4F7F DNAWorks \u65E0\u6CD5\u7EE7\u7EED\u4F18\u5316\u3002");
      }
      throw new Error("DNAWorks \u672A\u751F\u6210\u53EF\u89E3\u6790\u7684\u4F18\u5316\u5E8F\u5217\uFF0C\u8BF7\u68C0\u67E5\u8F93\u5165\u5E8F\u5217\u4E0E DNAWorks \u8F93\u51FA");
    }
    if (expectedMinLength && optimized.length < expectedMinLength) {
      throw new Error(`DNAWorks \u8F93\u51FA\u957F\u5EA6\u5F02\u5E38\uFF1A\u671F\u671B\u81F3\u5C11 ${expectedMinLength} nt\uFF0C\u5B9E\u9645 ${optimized.length} nt`);
    }
    const polished = polishRepeats(optimized, effectiveParams);
    let finalSequence = polished.sequence;
    const retainWarnings = [];
    let protectedCodonIndexes = [];
    if (isDna && effectiveParams.retainEnzymes?.length) {
      const retainConstraint = buildRetainConstraint(clean, effectiveParams.retainEnzymes);
      protectedCodonIndexes = retainConstraint.protectedCodonIndexes;
      finalSequence = restoreProtectedCodons(clean, finalSequence, protectedCodonIndexes);
      for (const site of retainConstraint.missingSites) {
        retainWarnings.push(`\u8B66\u544A: \u539F\u59CBDNA\u5E8F\u5217\u4E2D\u672A\u627E\u5230\u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9 ${site}\uFF0C\u5DF2\u5FFD\u7565\u8BE5\u7EA6\u675F`);
      }
      for (const site of retainConstraint.normalizedSites) {
        const expectedCount = retainConstraint.expectedSiteCounts[site] ?? 0;
        if (expectedCount === 0) continue;
        const actualCount = countRestrictionSiteOccurrences(finalSequence, site);
        if (actualCount < expectedCount) {
          retainWarnings.push(`\u8B66\u544A: \u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9 ${site} \u672A\u88AB\u5B8C\u6574\u4FDD\u7559\uFF08\u539F\u59CB ${expectedCount} \u5904\uFF0C\u5F53\u524D ${actualCount} \u5904\uFF09`);
        }
      }
    } else if (isProtein && effectiveParams.retainEnzymes?.length) {
      retainWarnings.push("\u8B66\u544A: \u86CB\u767D\u5E8F\u5217\u8F93\u5165\u65E0\u6CD5\u8BC6\u522B\u539F\u59CBDNA\u4E2D\u7684\u9176\u5207\u4F4D\u70B9\uFF0C\u5DF2\u5FFD\u7565\u201C\u9700\u8981\u4FDD\u7559\u7684\u9176\u5207\u4F4D\u70B9\u201D\u7EA6\u675F");
    }
    let optimizedMetrics = scoreDnaSequence(finalSequence, params.hostSpecies, params.codonTable);
    const caiWarnings = [];
    if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI2) {
      const lifted = raiseCaiAboveThreshold(finalSequence, {
        hostSpecies: params.hostSpecies,
        codonTable: params.codonTable,
        avoidEnzymes: params.avoidEnzymes,
        targetGcMin: params.targetGcMin,
        targetGcMax: params.targetGcMax,
        protectedCodonIndexes
      });
      const liftedMetrics = scoreDnaSequence(lifted, params.hostSpecies, params.codonTable);
      if (liftedMetrics.cai > optimizedMetrics.cai) {
        caiWarnings.push(`CAI \u81EA\u52A8\u62C9\u5347\uFF1A${optimizedMetrics.cai.toFixed(3)} -> ${liftedMetrics.cai.toFixed(3)}`);
        finalSequence = lifted;
        optimizedMetrics = liftedMetrics;
      }
      if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI2) {
        caiWarnings.push(`\u8B66\u544A: \u81EA\u52A8\u62C9\u5347\u540E CAI ${optimizedMetrics.cai.toFixed(3)} \u4ECD\u4F4E\u4E8E\u9608\u503C ${MIN_ACCEPTABLE_CAI2}\uFF0C\u53D7\u9176\u5207\u4F4D\u70B9/GC \u7EA6\u675F\u9650\u5236`);
      }
    }
    const repeatStats = analyzeRepeatStats(finalSequence);
    const warnings = [
      ...optimizedMetrics.warnings,
      ...retainWarnings,
      ...caiWarnings,
      ...polished.note ? [polished.note] : [],
      ...params.eliminateRepeats !== false && repeatStats.total > 0 ? [`\u68C0\u6D4B\u5230 ${repeatStats.total} \u4E2A\u91CD\u590D\u5E8F\u5217\u533A\u57DF\uFF08DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}\uFF09`] : [],
      ...stderr.trim() ? [stderr.trim()] : []
    ];
    return {
      optimizedSequence: finalSequence,
      cai: optimizedMetrics.cai,
      gcContent: optimizedMetrics.gcContent,
      changes: countCodonChanges(dnaInput, finalSequence),
      warnings,
      repeatStats
    };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
}
async function optimizeByStrategy(sequence, params, strategy = "dnaworks") {
  if (strategy !== "dnaworks") {
    throw new Error("\u4EC5\u652F\u6301 dnaworks \u7B56\u7565");
  }
  return runDNAWorks(sequence, params);
}

// server/primerDesign.ts
var NN_PARAMS = {
  AA: { dh: -7.9, ds: -22.2 },
  TT: { dh: -7.9, ds: -22.2 },
  AT: { dh: -7.2, ds: -20.4 },
  TA: { dh: -7.2, ds: -21.3 },
  CA: { dh: -8.5, ds: -22.7 },
  TG: { dh: -8.5, ds: -22.7 },
  GT: { dh: -8.4, ds: -22.4 },
  AC: { dh: -8.4, ds: -22.4 },
  CT: { dh: -7.8, ds: -21 },
  AG: { dh: -7.8, ds: -21 },
  GA: { dh: -8.2, ds: -22.2 },
  TC: { dh: -8.2, ds: -22.2 },
  CG: { dh: -10.6, ds: -27.2 },
  GC: { dh: -9.8, ds: -24.4 },
  GG: { dh: -8, ds: -19.9 },
  CC: { dh: -8, ds: -19.9 }
};
var COMPLEMENT = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
  N: "N"
};
function normalizeDna(sequence) {
  return sequence.toUpperCase().replace(/\s/g, "").replace(/U/g, "T");
}
function calculateTm(sequence, naConc = 50, primerConc = 0.25) {
  const seq = normalizeDna(sequence);
  const length = seq.length;
  if (!length) return 0;
  if (length < 14) {
    const at = (seq.match(/[AT]/g) || []).length;
    const gc = (seq.match(/[GC]/g) || []).length;
    return 2 * at + 4 * gc;
  }
  let deltaH = 0;
  let deltaS = 0;
  for (let i = 0; i < seq.length - 1; i++) {
    const pair = seq.slice(i, i + 2);
    const nn = NN_PARAMS[pair];
    if (!nn) return 0;
    deltaH += nn.dh;
    deltaS += nn.ds;
  }
  if (/^[GC]/.test(seq)) {
    deltaH += 0.1;
    deltaS += -2.8;
  } else {
    deltaH += 2.3;
    deltaS += 4.1;
  }
  if (/[GC]$/.test(seq)) {
    deltaH += 0.1;
    deltaS += -2.8;
  } else {
    deltaH += 2.3;
    deltaS += 4.1;
  }
  const R = 1.987;
  const primerM = Math.max(primerConc, 0.01) * 1e-6;
  const ct = primerM / 4;
  const tmKelvin = deltaH * 1e3 / (deltaS + R * Math.log(ct));
  const saltAdj = 16.6 * Math.log10(Math.max(naConc, 1) / 1e3);
  const tm = tmKelvin - 273.15 + saltAdj;
  return Math.round(tm * 10) / 10;
}
function calculateGCContent(sequence) {
  const seq = normalizeDna(sequence);
  if (!seq.length) return 0;
  const gc = (seq.match(/[GC]/g) || []).length;
  return Math.round(gc / seq.length * 1e3) / 10;
}
function reverseComplement2(sequence) {
  return normalizeDna(sequence).split("").reverse().map((base) => COMPLEMENT[base] || base).join("");
}
function maxConsecutiveMatches(a, b) {
  let best = 0;
  for (let offset = -b.length; offset <= a.length; offset++) {
    let run = 0;
    for (let i = 0; i < a.length; i++) {
      const j = i - offset;
      if (j < 0 || j >= b.length) {
        run = 0;
        continue;
      }
      if (a[i] === b[j]) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
  }
  return best;
}
function checkPrimerQuality(sequence, maxSelfComplementarity = 7) {
  const issues = [];
  let score = 100;
  const seq = normalizeDna(sequence);
  const rc = reverseComplement2(seq);
  if (/([ATCG])\1{3,}/.test(seq)) {
    issues.push("Contains poly-nucleotide runs");
    score -= 16;
  }
  const gcClamp = (seq.slice(-2).match(/[GC]/g) || []).length;
  if (gcClamp < 1) {
    issues.push("Weak 3' GC clamp");
    score -= 12;
  }
  if (gcClamp > 2) {
    issues.push("Over-strong 3' GC clamp");
    score -= 6;
  }
  for (let i = 0; i < seq.length - 3; i++) {
    const dinuc = seq.substring(i, i + 2);
    const rest = seq.substring(i + 2);
    if (rest.includes(dinuc.repeat(2))) {
      issues.push("Contains dinucleotide repeats");
      score -= 12;
      break;
    }
  }
  const selfComp = maxConsecutiveMatches(seq, rc);
  if (selfComp > maxSelfComplementarity) {
    issues.push("High self-complementarity");
    score -= (selfComp - maxSelfComplementarity) * 6;
  }
  const threePrimeSelf = maxConsecutiveMatches(seq.slice(-8), rc.slice(0, 8));
  if (threePrimeSelf >= 4) {
    issues.push("High 3' self-complementarity");
    score -= (threePrimeSelf - 3) * 8;
  }
  return { score, issues };
}
function enumerateForwardFailureStats(template, startMin, startMax, params) {
  const seq = normalizeDna(template);
  const stats = {
    total: 0,
    invalidBase: 0,
    tmLow: 0,
    tmHigh: 0,
    gcLow: 0,
    gcHigh: 0,
    qualityLow: 0,
    pass: 0
  };
  for (let start = startMin; start <= startMax; start++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (start + len > seq.length) continue;
      stats.total++;
      const primerSeq = seq.slice(start, start + len);
      if (!/^[ATCG]+$/.test(primerSeq)) {
        stats.invalidBase++;
        continue;
      }
      const tm = calculateTm(primerSeq, params.naConc, params.primerConc);
      if (tm < params.minTm) {
        stats.tmLow++;
        continue;
      }
      if (tm > params.maxTm) {
        stats.tmHigh++;
        continue;
      }
      const gc = calculateGCContent(primerSeq);
      if (gc < params.minGC) {
        stats.gcLow++;
        continue;
      }
      if (gc > params.maxGC) {
        stats.gcHigh++;
        continue;
      }
      const quality = checkPrimerQuality(primerSeq, params.maxSelfComplementarity);
      if (quality.score < 50) {
        stats.qualityLow++;
        continue;
      }
      stats.pass++;
    }
  }
  return stats;
}
function enumerateReverseFailureStats(template, endMin, endMax, params) {
  const seq = normalizeDna(template);
  const stats = {
    total: 0,
    invalidBase: 0,
    tmLow: 0,
    tmHigh: 0,
    gcLow: 0,
    gcHigh: 0,
    qualityLow: 0,
    pass: 0
  };
  for (let end = endMin; end <= endMax; end++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (end - len < 0) continue;
      stats.total++;
      const templateRegion = seq.slice(end - len, end);
      const primerSeq = reverseComplement2(templateRegion);
      if (!/^[ATCG]+$/.test(primerSeq)) {
        stats.invalidBase++;
        continue;
      }
      const tm = calculateTm(primerSeq, params.naConc, params.primerConc);
      if (tm < params.minTm) {
        stats.tmLow++;
        continue;
      }
      if (tm > params.maxTm) {
        stats.tmHigh++;
        continue;
      }
      const gc = calculateGCContent(primerSeq);
      if (gc < params.minGC) {
        stats.gcLow++;
        continue;
      }
      if (gc > params.maxGC) {
        stats.gcHigh++;
        continue;
      }
      const quality = checkPrimerQuality(primerSeq, params.maxSelfComplementarity);
      if (quality.score < 50) {
        stats.qualityLow++;
        continue;
      }
      stats.pass++;
    }
  }
  return stats;
}
function summarizeStats(prefix, stats) {
  const rows = [
    { label: "Tm\u504F\u4F4E", n: stats.tmLow },
    { label: "Tm\u504F\u9AD8", n: stats.tmHigh },
    { label: "GC\u504F\u4F4E", n: stats.gcLow },
    { label: "GC\u504F\u9AD8", n: stats.gcHigh },
    { label: "\u81EA\u4E92\u8865/\u91CD\u590D\u8D85\u9650", n: stats.qualityLow },
    { label: "\u542B\u975EATCG\u5B57\u7B26", n: stats.invalidBase }
  ].filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  if (!rows.length) return `${prefix}\u7A97\u53E3\u5185\u65E0\u53EF\u7528\u5019\u9009`;
  return `${prefix}\u5019\u9009\u4E0D\u8DB3\uFF08${rows.map((x) => `${x.label}${x.n}`).join("\uFF0C")}\uFF09`;
}
function buildForwardCandidates(template, startMin, startMax, params) {
  const list = [];
  const seq = normalizeDna(template);
  const targetTm = (params.minTm + params.maxTm) / 2;
  const targetGc = (params.minGC + params.maxGC) / 2;
  for (let start = startMin; start <= startMax; start++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (start + len > seq.length) continue;
      const primerSeq = seq.slice(start, start + len);
      if (!/^[ATCG]+$/.test(primerSeq)) continue;
      const tm = calculateTm(primerSeq, params.naConc, params.primerConc);
      const gc = calculateGCContent(primerSeq);
      if (tm < params.minTm || tm > params.maxTm || gc < params.minGC || gc > params.maxGC) continue;
      const quality = checkPrimerQuality(primerSeq, params.maxSelfComplementarity);
      if (quality.score < 50) continue;
      const score = quality.score - Math.abs(tm - targetTm) * 1.8 - Math.abs(gc - targetGc) * 0.8;
      list.push({
        sequence: primerSeq,
        start,
        end: start + len,
        length: len,
        tm,
        gcContent: gc,
        qualityScore: Math.round(score * 10) / 10,
        components: { annealingRegion: primerSeq },
        score,
        issues: quality.issues
      });
    }
  }
  return list.sort((a, b) => b.score - a.score).slice(0, 60);
}
function buildReverseCandidates(template, endMin, endMax, params) {
  const list = [];
  const seq = normalizeDna(template);
  const targetTm = (params.minTm + params.maxTm) / 2;
  const targetGc = (params.minGC + params.maxGC) / 2;
  for (let end = endMin; end <= endMax; end++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (end - len < 0) continue;
      const templateRegion = seq.slice(end - len, end);
      const primerSeq = reverseComplement2(templateRegion);
      if (!/^[ATCG]+$/.test(primerSeq)) continue;
      const tm = calculateTm(primerSeq, params.naConc, params.primerConc);
      const gc = calculateGCContent(primerSeq);
      if (tm < params.minTm || tm > params.maxTm || gc < params.minGC || gc > params.maxGC) continue;
      const quality = checkPrimerQuality(primerSeq, params.maxSelfComplementarity);
      if (quality.score < 50) continue;
      const score = quality.score - Math.abs(tm - targetTm) * 1.8 - Math.abs(gc - targetGc) * 0.8;
      list.push({
        sequence: primerSeq,
        start: end - len,
        end,
        length: len,
        tm,
        gcContent: gc,
        qualityScore: Math.round(score * 10) / 10,
        components: { annealingRegion: primerSeq },
        score,
        issues: quality.issues
      });
    }
  }
  return list.sort((a, b) => b.score - a.score).slice(0, 60);
}
function toRequiredParams(params = {}) {
  return {
    minLength: params.minLength ?? 18,
    maxLength: params.maxLength ?? 28,
    minTm: params.minTm ?? 56,
    maxTm: params.maxTm ?? 66,
    minGC: params.minGC ?? 35,
    maxGC: params.maxGC ?? 65,
    naConc: params.naConc ?? 50,
    primerConc: params.primerConc ?? 0.25,
    maxTmDiff: params.maxTmDiff ?? 3,
    maxSelfComplementarity: params.maxSelfComplementarity ?? 7,
    minProductLength: params.minProductLength ?? 0,
    maxProductLength: params.maxProductLength ?? Number.MAX_SAFE_INTEGER,
    protectiveBasesLength: params.protectiveBasesLength ?? 4,
    sequencingOffset: params.sequencingOffset ?? 150,
    synthesisOligoLength: params.synthesisOligoLength ?? 70,
    synthesisMinOverlap: params.synthesisMinOverlap ?? 19,
    synthesisMaxOverlap: params.synthesisMaxOverlap ?? (params.synthesisMinOverlap ?? 19),
    synthesisTargetOverlapTm: params.synthesisTargetOverlapTm ?? 60
  };
}
function designPCRPrimers(template, targetStart, targetEnd, params = {}) {
  const p = toRequiredParams(params);
  const seq = normalizeDna(template);
  if (targetStart < 0 || targetEnd > seq.length || targetStart >= targetEnd) return null;
  const maxShift = 6;
  const forwardStartMin = Math.max(0, targetStart - maxShift);
  const forwardStartMax = Math.min(targetStart + maxShift, seq.length - p.minLength);
  const reverseEndMin = Math.max(p.minLength, targetEnd - maxShift);
  const reverseEndMax = Math.min(seq.length, targetEnd + maxShift);
  const forwards = buildForwardCandidates(seq, forwardStartMin, forwardStartMax, p);
  const reverses = buildReverseCandidates(seq, reverseEndMin, reverseEndMax, p);
  if (!forwards.length || !reverses.length) return null;
  let best = null;
  for (const f of forwards) {
    for (const r of reverses) {
      if (r.start <= f.start) continue;
      const productLength = r.end - f.start;
      if (productLength < p.minProductLength || productLength > p.maxProductLength) continue;
      const tmDiff = Math.abs(f.tm - r.tm);
      if (tmDiff > p.maxTmDiff) continue;
      const cross = maxConsecutiveMatches(f.sequence, reverseComplement2(r.sequence));
      const cross3 = maxConsecutiveMatches(f.sequence.slice(-8), reverseComplement2(r.sequence).slice(0, 8));
      const pairScore = f.score + r.score - tmDiff * 8 - cross * 1.8 - cross3 * 5;
      if (!best || pairScore > best.score) {
        best = { forward: f, reverse: r, score: pairScore, productLength };
      }
    }
  }
  if (!best) return null;
  return {
    forward: best.forward,
    reverse: best.reverse,
    productLength: best.productLength
  };
}
function explainPCRDesignFailure(template, targetStart, targetEnd, params = {}) {
  const seq = normalizeDna(template);
  if (!seq) return "\u6A21\u677F\u5E8F\u5217\u4E3A\u7A7A";
  if (!/^[ATCGN]+$/.test(seq)) return "\u6A21\u677F\u5E8F\u5217\u5305\u542B\u975E\u6CD5\u5B57\u7B26\uFF0C\u4EC5\u652F\u6301ATCGN";
  const p = toRequiredParams(params);
  if (p.minLength > p.maxLength) return "\u6700\u5C0F\u957F\u5EA6\u5927\u4E8E\u6700\u5927\u957F\u5EA6";
  if (p.minTm > p.maxTm) return "\u6700\u5C0FTm\u5927\u4E8E\u6700\u5927Tm";
  if (p.minGC > p.maxGC) return "\u6700\u5C0FGC\u5927\u4E8E\u6700\u5927GC";
  if (targetStart < 0 || targetEnd > seq.length || targetStart >= targetEnd) return "\u76EE\u6807\u533A\u95F4\u65E0\u6548";
  const maxShift = 6;
  const forwardStartMin = Math.max(0, targetStart - maxShift);
  const forwardStartMax = Math.min(targetStart + maxShift, seq.length - p.minLength);
  const reverseEndMin = Math.max(p.minLength, targetEnd - maxShift);
  const reverseEndMax = Math.min(seq.length, targetEnd + maxShift);
  if (forwardStartMax < forwardStartMin || reverseEndMax < reverseEndMin) return "\u76EE\u6807\u533A\u57DF\u8FC7\u77ED\uFF0C\u65E0\u6CD5\u751F\u6210\u6EE1\u8DB3\u957F\u5EA6\u7EA6\u675F\u7684\u5F15\u7269";
  const forwards = buildForwardCandidates(seq, forwardStartMin, forwardStartMax, p);
  const reverses = buildReverseCandidates(seq, reverseEndMin, reverseEndMax, p);
  if (!forwards.length || !reverses.length) {
    const fStats = enumerateForwardFailureStats(seq, forwardStartMin, forwardStartMax, p);
    const rStats = enumerateReverseFailureStats(seq, reverseEndMin, reverseEndMax, p);
    const parts = [];
    if (!forwards.length) parts.push(summarizeStats("\u6B63\u5411", fStats));
    if (!reverses.length) parts.push(summarizeStats("\u53CD\u5411", rStats));
    return parts.join("\uFF1B");
  }
  let tmDiffFail = 0;
  let productLenFail = 0;
  let dimerFail = 0;
  for (const f of forwards) {
    for (const r of reverses) {
      if (r.start <= f.start) continue;
      const productLength = r.end - f.start;
      if (productLength < p.minProductLength || productLength > p.maxProductLength) {
        productLenFail++;
        continue;
      }
      const tmDiff = Math.abs(f.tm - r.tm);
      if (tmDiff > p.maxTmDiff) {
        tmDiffFail++;
        continue;
      }
      const cross = maxConsecutiveMatches(f.sequence, reverseComplement2(r.sequence));
      const cross3 = maxConsecutiveMatches(f.sequence.slice(-8), reverseComplement2(r.sequence).slice(0, 8));
      if (cross > p.maxSelfComplementarity || cross3 >= 4) {
        dimerFail++;
        continue;
      }
    }
  }
  const pairReasons = [
    { label: "\u5F15\u7269\u5BF9Tm\u5DEE\u8FC7\u5927", n: tmDiffFail },
    { label: "\u4EA7\u7269\u957F\u5EA6\u4E0D\u6EE1\u8DB3\u7EA6\u675F", n: productLenFail },
    { label: "\u5F15\u7269\u5BF9\u4E92\u8865\u6027\u8FC7\u5F3A", n: dimerFail }
  ].filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  if (pairReasons.length) return `\u5019\u9009\u5B58\u5728\u4F46\u914D\u5BF9\u5931\u8D25\uFF1A${pairReasons.map((x) => `${x.label}${x.n}`).join("\uFF0C")}`;
  return "\u5019\u9009\u5B58\u5728\u4F46\u672A\u627E\u5230\u6EE1\u8DB3\u6240\u6709\u7EA6\u675F\u7684\u5F15\u7269\u5BF9\uFF0C\u8BF7\u653E\u5BBD\u53C2\u6570";
}
function designSequencingPrimers(template, targetStart, targetEnd, params = {}) {
  const p = toRequiredParams(params);
  const seq = normalizeDna(template);
  const offset = p.sequencingOffset;
  const flankWindow = 120;
  const fStartMax = Math.max(0, targetStart - offset);
  const fStartMin = Math.max(0, fStartMax - flankWindow);
  const forwardCandidates = buildForwardCandidates(seq, fStartMin, fStartMax, p);
  const forwardPrimer = forwardCandidates[0] || null;
  const rEndMin = Math.min(seq.length, targetEnd + offset);
  const rEndMax = Math.min(seq.length, rEndMin + flankWindow);
  const reverseCandidates = buildReverseCandidates(seq, rEndMin, rEndMax, p);
  const reversePrimer = reverseCandidates[0] || null;
  return { forward: forwardPrimer, reverse: reversePrimer };
}
function explainSequencingDesignFailure(template, targetStart, targetEnd, params = {}) {
  const seq = normalizeDna(template);
  if (!seq) return "\u6A21\u677F\u5E8F\u5217\u4E3A\u7A7A";
  if (!/^[ATCGN]+$/.test(seq)) return "\u6A21\u677F\u5E8F\u5217\u5305\u542B\u975E\u6CD5\u5B57\u7B26\uFF0C\u4EC5\u652F\u6301ATCGN";
  const p = toRequiredParams(params);
  const offset = p.sequencingOffset;
  const flankWindow = 120;
  const fStartMax = Math.max(0, targetStart - offset);
  const fStartMin = Math.max(0, fStartMax - flankWindow);
  const rEndMin = Math.min(seq.length, targetEnd + offset);
  const rEndMax = Math.min(seq.length, rEndMin + flankWindow);
  const forwardCandidates = buildForwardCandidates(seq, fStartMin, fStartMax, p);
  const reverseCandidates = buildReverseCandidates(seq, rEndMin, rEndMax, p);
  if (!forwardCandidates.length && !reverseCandidates.length) {
    return "\u4E0A\u4E0B\u6E38\u7A97\u53E3\u5747\u65E0\u53EF\u7528\u6D4B\u5E8F\u5F15\u7269\uFF0C\u8BF7\u964D\u4F4ETm/GC\u9608\u503C\u6216\u51CF\u5C0F\u504F\u79FB\u8DDD\u79BB";
  }
  if (!forwardCandidates.length) {
    return "\u4E0A\u6E38\u7A97\u53E3\u65E0\u53EF\u7528\u6D4B\u5E8F\u5F15\u7269\uFF0C\u8BF7\u964D\u4F4ETm/GC\u9608\u503C\u6216\u51CF\u5C0F\u504F\u79FB\u8DDD\u79BB";
  }
  if (!reverseCandidates.length) {
    return "\u4E0B\u6E38\u7A97\u53E3\u65E0\u53EF\u7528\u6D4B\u5E8F\u5F15\u7269\uFF0C\u8BF7\u964D\u4F4ETm/GC\u9608\u503C\u6216\u51CF\u5C0F\u504F\u79FB\u8DDD\u79BB";
  }
  return "\u6D4B\u5E8F\u5F15\u7269\u5019\u9009\u672A\u6EE1\u8DB3\u5F53\u524D\u7EA6\u675F";
}
function approximateHairpinScore(sequence) {
  const seq = normalizeDna(sequence);
  let best = 0;
  for (let stem = 4; stem <= 9; stem++) {
    for (let loop = 3; loop <= 8; loop++) {
      for (let i = 0; i + stem + loop + stem <= seq.length; i++) {
        const left = seq.slice(i, i + stem);
        const right = seq.slice(i + stem + loop, i + stem + loop + stem);
        const comp = maxConsecutiveMatches(left, reverseComplement2(right));
        if (comp > best) best = comp;
      }
    }
  }
  return best;
}
function estimateOligoScores(raw) {
  const seq = normalizeDna(raw);
  const selfDimer = maxConsecutiveMatches(seq, reverseComplement2(seq));
  const hairpin = approximateHairpinScore(seq);
  const gc = calculateGCContent(seq);
  const gcPenalty = Math.abs(gc - 50) / 8;
  const quality = Math.max(0, 100 - selfDimer * 6 - hairpin * 7 - gcPenalty * 4);
  return { selfDimer, hairpin, quality: Math.round(quality * 10) / 10 };
}
function designSynthesisOligos(template, params = {}) {
  const seq = normalizeDna(template);
  if (!seq || !/^[ATCG]+$/.test(seq)) return null;
  const p = toRequiredParams(params);
  const primerLength = Math.max(25, Math.floor(p.synthesisOligoLength));
  const linkerLength = Math.max(0, Math.floor(p.synthesisMinOverlap));
  const step = 2 * primerLength - 2 * linkerLength;
  if (step <= 0) return null;
  const complementMap = { A: "T", T: "A", C: "G", G: "C" };
  const complement2 = seq.split("").map((b) => complementMap[b] || b).join("");
  const reverse = (s) => s.split("").reverse().join("");
  const mod = (a, b) => (a % b + b) % b;
  const e = mod(seq.length - (2 * primerLength - linkerLength), step);
  const f = Math.max(1, Math.floor((seq.length - (2 * primerLength - linkerLength)) / step) + 1);
  const g = Math.round((25 - e) / f);
  const n = Math.max(25, e >= 25 ? primerLength : primerLength - g);
  const denom = 2 * n - 2 * linkerLength;
  if (denom <= 0) return null;
  const k = Math.max(1, 2 * (Math.floor((seq.length - (2 * n - linkerLength)) / denom) + 2));
  const oligos = [];
  for (let idx = 1; idx <= k; idx++) {
    const m = (Math.round(idx / 2) - 1) * denom + 1 - (idx % 2 - 1) * (n - linkerLength);
    const start = Math.max(1, m);
    const zero = start - 1;
    const oddRaw = seq.slice(zero, zero + n);
    const evenRaw = complement2.slice(zero, zero + n);
    const currentLen = idx % 2 === 1 ? oddRaw.length : evenRaw.length;
    let finalSeq = "";
    let strand = idx % 2 === 1 ? "forward" : "reverse";
    if (idx % 2 === 1) {
      finalSeq = currentLen >= 25 ? oddRaw : complement2.slice(-25);
    } else {
      finalSeq = currentLen >= 25 ? reverse(evenRaw) : reverse(complement2.slice(-25));
    }
    if (!finalSeq) continue;
    const est = estimateOligoScores(finalSeq);
    oligos.push({
      index: idx,
      start,
      end: Math.min(seq.length, start + n - 1),
      length: finalSeq.length,
      strand,
      sequence: finalSeq,
      overlapWithNext: idx < k ? linkerLength : void 0,
      selfDimerScore: est.selfDimer,
      hairpinScore: est.hairpin,
      qualityScore: est.quality
    });
  }
  if (!oligos.length) return null;
  return {
    oligos,
    globalScore: 0,
    avgOverlapTmDelta: 0,
    maxSelfDimer: Math.max(...oligos.map((o) => o.selfDimerScore || 0)),
    maxHairpin: Math.max(...oligos.map((o) => o.hairpinScore || 0))
  };
}
function explainSynthesisDesignFailure(template, params = {}) {
  const seq = normalizeDna(template);
  if (!seq) return "\u6A21\u677F\u5E8F\u5217\u4E3A\u7A7A";
  if (!/^[ATCG]+$/.test(seq)) return "\u57FA\u56E0\u5408\u6210\u5F15\u7269\u4EC5\u652F\u6301ATCG\u5E8F\u5217\uFF0C\u8BF7\u5148\u53BB\u9664N\u6216\u5176\u4ED6\u5B57\u7B26";
  const p = toRequiredParams(params);
  const primerLength = Math.max(25, Math.floor(p.synthesisOligoLength));
  const linkerLength = Math.max(0, Math.floor(p.synthesisMinOverlap));
  if (primerLength < 25) return "\u5F15\u7269\u957F\u5EA6\u4E0D\u80FD\u5C0F\u4E8E 25";
  if (linkerLength < 0) return "linker\u957F\u5EA6\u4E0D\u80FD\u5C0F\u4E8E 0";
  if (2 * primerLength - 2 * linkerLength <= 0) return "\u53C2\u6570\u65E0\u6548\uFF1A2*\u5F15\u7269\u957F\u5EA6-2*linker\u957F\u5EA6 \u5FC5\u987B\u5927\u4E8E 0";
  return "\u5F53\u524D\u53C2\u6570\u65E0\u6CD5\u6309\u516C\u5F0F\u5207\u5206\u51FA\u6709\u6548\u5F15\u7269\uFF0C\u8BF7\u8C03\u6574\u5F15\u7269\u957F\u5EA6\u6216linker\u957F\u5EA6";
}

// server/routers.ts
var nonEmptyText = z.string().trim().min(1);
var dnaOrProteinText = z.string().transform((v) => v.trim()).refine((v) => v.length > 0, "\u5E8F\u5217\u4E0D\u80FD\u4E3A\u7A7A");
var primerMode = z.enum(["pcr", "sequencing", "synthesis"]);
function normalizeDnaLike(input) {
  return input.toUpperCase().replace(/\s/g, "");
}
function buildTemplate(target, leftArm, rightArm) {
  const left = normalizeDnaLike(leftArm ?? "");
  const right = normalizeDnaLike(rightArm ?? "");
  const core = normalizeDnaLike(target);
  return {
    template: `${left}${core}${right}`,
    leftArm: left,
    rightArm: right,
    target: core
  };
}
async function executeOptimizationBatchCompat(input) {
  const runId = nanoid(12);
  const createdAt = /* @__PURE__ */ new Date();
  const host = await getHostSpeciesById(input.hostSpeciesId);
  if (!host) throw new Error("\u5BBF\u4E3B\u7269\u79CD\u4E0D\u5B58\u5728");
  const secondaryHost = input.secondaryHostSpeciesId ? await getHostSpeciesById(input.secondaryHostSpeciesId) : null;
  const results = await Promise.all(
    input.items.map(async (item, index) => {
      const optimized = await optimizeByStrategy(item.cdsSequence, {
        hostSpecies: host.name,
        codonTable: host.codonTable ?? void 0,
        avoidEnzymes: input.avoidEnzymes,
        retainEnzymes: input.retainEnzymes,
        eliminateRepeats: true
      });
      return {
        id: index + 1,
        geneName: item.geneName,
        avgGcContent: optimized.gcContent,
        hostName: host.name,
        secondaryHostName: secondaryHost?.name ?? null,
        avoidEnzymesDisplay: (input.avoidEnzymes ?? []).join(", "),
        originalSequence: item.cdsSequence,
        optimizedSequence: optimized.optimizedSequence,
        caiScore: optimized.cai,
        fivePrimeFlank: item.fivePrimeFlank ?? "",
        threePrimeFlank: item.threePrimeFlank ?? "",
        warnings: optimized.warnings,
        repeatStats: optimized.repeatStats
      };
    })
  );
  await insertOptimizationRun({
    runId,
    mode: "batch",
    input: {
      ...input,
      hostSpeciesName: host.name,
      secondaryHostSpeciesName: secondaryHost?.name ?? null,
      createdAt
    },
    output: { results },
    status: "success",
    createdAt
  });
  return {
    jobId: runId,
    createdAt,
    failed: 0,
    results
  };
}
async function getOptimizationJobCompat(runId) {
  const run = await getRunByTypeAndId("optimization", runId);
  if (!run) return null;
  const input = run.input ?? {};
  const output = run.output ?? {};
  const results = Array.isArray(output.results) ? output.results.map((result) => ({
    ...result,
    repeatStats: result?.repeatStats ?? (result?.optimizedSequence ? analyzeRepeatStats(result.optimizedSequence) : null)
  })) : [];
  const job = {
    id: run.id,
    jobId: run.runId,
    batchNo: null,
    hostSpeciesId: input.hostSpeciesId ?? null,
    secondaryHostSpeciesId: input.secondaryHostSpeciesId ?? null,
    avoidEnzymes: input.avoidEnzymes ?? [],
    retainEnzymes: input.retainEnzymes ?? [],
    createdAt: run.createdAt,
    firstGeneName: results[0]?.geneName ?? null,
    resultCount: results.length,
    status: run.status,
    input
  };
  return { job, results };
}
var appRouter = router({
  hosts: router({
    list: publicProcedure.query(async () => {
      return listHostSpecies();
    }),
    reorder: publicProcedure.input(
      z.object({
        orderedIds: z.array(z.number()).min(1)
      })
    ).mutation(async ({ input }) => {
      await saveHostSpeciesOrder(input.orderedIds);
      return { ok: true };
    }),
    upsert: publicProcedure.input(
      z.object({
        id: z.number().optional(),
        name: nonEmptyText,
        scientificName: z.string().trim().optional().nullable(),
        category: z.string().trim().optional().nullable(),
        sortOrder: z.number().optional().nullable(),
        codonTable: z.any().optional().nullable(),
        isActive: z.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      return upsertHostSpecies(input);
    }),
    delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteHostSpecies(input.id);
      return { ok: true };
    })
  }),
  enzymes: router({
    list: publicProcedure.query(async () => {
      return listRestrictionEnzymes();
    }),
    upsert: publicProcedure.input(
      z.object({
        id: z.number().optional(),
        name: nonEmptyText,
        recognitionSequence: nonEmptyText,
        cutPattern: z.string().trim().optional().nullable(),
        overhang: z.enum(["blunt", "5_prime", "3_prime"]).optional().nullable(),
        methylationSensitivity: z.string().trim().optional().nullable(),
        isCommon: z.boolean().optional()
      })
    ).mutation(async ({ input }) => {
      return upsertRestrictionEnzyme(input);
    }),
    delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await deleteRestrictionEnzyme(input.id);
      return { ok: true };
    })
  }),
  optimization: router({
    run: publicProcedure.input(
      z.object({
        sequence: dnaOrProteinText,
        hostSpeciesId: z.number(),
        avoidSites: z.array(nonEmptyText).optional().default([]),
        targetGcMin: z.number().optional(),
        targetGcMax: z.number().optional(),
        eliminateRepeats: z.boolean().optional().default(true)
      })
    ).mutation(async ({ input }) => {
      const runId = nanoid(12);
      const createdAt = /* @__PURE__ */ new Date();
      try {
        const host = await getHostSpeciesById(input.hostSpeciesId);
        if (!host) throw new Error("\u5BBF\u4E3B\u7269\u79CD\u4E0D\u5B58\u5728");
        const result = await optimizeByStrategy(input.sequence, {
          hostSpecies: host.name,
          codonTable: host.codonTable ?? void 0,
          avoidEnzymes: input.avoidSites,
          targetGcMin: input.targetGcMin,
          targetGcMax: input.targetGcMax,
          eliminateRepeats: input.eliminateRepeats
        });
        const output = {
          ...result,
          score: scoreDnaSequence(result.optimizedSequence, host.name, host.codonTable ?? void 0),
          codonUsage: analyzeCodonUsage(result.optimizedSequence)
        };
        await insertOptimizationRun({
          runId,
          mode: "single",
          input: { ...input, hostSpeciesName: host.name },
          output,
          status: "success",
          createdAt
        });
        return { runId, createdAt, output };
      } catch (e) {
        const errorMessage = e?.message ?? "\u4F18\u5316\u5931\u8D25";
        await insertOptimizationRun({
          runId,
          mode: "single",
          input,
          output: null,
          status: "failed",
          errorMessage,
          createdAt
        });
        throw e;
      }
    }),
    runBatch: publicProcedure.input(
      z.object({
        items: z.array(
          z.object({
            geneName: nonEmptyText,
            sequence: dnaOrProteinText
          })
        ).min(1),
        hostSpeciesId: z.number(),
        avoidSites: z.array(nonEmptyText).optional().default([]),
        targetGcMin: z.number().optional(),
        targetGcMax: z.number().optional(),
        eliminateRepeats: z.boolean().optional().default(true)
      })
    ).mutation(async ({ input }) => {
      const runId = nanoid(12);
      const createdAt = /* @__PURE__ */ new Date();
      try {
        const host = await getHostSpeciesById(input.hostSpeciesId);
        if (!host) throw new Error("\u5BBF\u4E3B\u7269\u79CD\u4E0D\u5B58\u5728");
        const results = await Promise.all(
          input.items.map(async (item) => {
            const output = await optimizeByStrategy(item.sequence, {
              hostSpecies: host.name,
              codonTable: host.codonTable ?? void 0,
              avoidEnzymes: input.avoidSites,
              targetGcMin: input.targetGcMin,
              targetGcMax: input.targetGcMax,
              eliminateRepeats: input.eliminateRepeats
            });
            return { geneName: item.geneName, inputSequence: item.sequence, ...output };
          })
        );
        await insertOptimizationRun({
          runId,
          mode: "batch",
          input: { ...input, hostSpeciesName: host.name },
          output: { results },
          status: "success",
          createdAt
        });
        return { runId, createdAt, output: { results } };
      } catch (e) {
        const errorMessage = e?.message ?? "\u6279\u91CF\u4F18\u5316\u5931\u8D25";
        await insertOptimizationRun({
          runId,
          mode: "batch",
          input,
          output: null,
          status: "failed",
          errorMessage,
          createdAt
        });
        throw e;
      }
    })
  }),
  optimizationJobs: router({
    runBatch: publicProcedure.input(
      z.object({
        items: z.array(
          z.object({
            geneName: z.string(),
            cdsSequence: z.string(),
            fivePrimeFlank: z.string().optional(),
            threePrimeFlank: z.string().optional()
          })
        ),
        hostSpeciesId: z.number(),
        secondaryHostSpeciesId: z.number().optional(),
        avoidEnzymes: z.array(z.string()).optional(),
        retainEnzymes: z.array(z.string()).optional()
      })
    ).mutation(async ({ input }) => {
      return executeOptimizationBatchCompat(input);
    }),
    list: publicProcedure.query(async () => {
      const runs = await listRuns({ type: "optimization", limit: 200 });
      return runs.filter((r) => r.mode === "batch").map((r) => {
        const input = r.input ?? {};
        const output = r.output ?? {};
        const results = Array.isArray(output.results) ? output.results : [];
        return {
          jobId: r.runId,
          createdAt: r.createdAt,
          firstGeneName: results[0]?.geneName ?? null,
          resultCount: results.length,
          hostSpeciesId: input.hostSpeciesId ?? null,
          secondaryHostSpeciesId: input.secondaryHostSpeciesId ?? null,
          avoidEnzymes: input.avoidEnzymes ?? [],
          retainEnzymes: input.retainEnzymes ?? []
        };
      });
    }),
    getByJobId: publicProcedure.input(z.object({ jobId: z.string() })).query(async ({ input }) => {
      const found = await getOptimizationJobCompat(input.jobId);
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Optimization job not found" });
      }
      return found;
    }),
    rerunByJobId: publicProcedure.input(z.object({ jobId: z.string() })).mutation(async ({ input }) => {
      const found = await getOptimizationJobCompat(input.jobId);
      if (!found) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Optimization job not found" });
      }
      const sourceInput = found.job.input ?? {};
      const items = Array.isArray(sourceInput.items) ? sourceInput.items : [];
      const rerun = await executeOptimizationBatchCompat({
        items,
        hostSpeciesId: sourceInput.hostSpeciesId,
        secondaryHostSpeciesId: sourceInput.secondaryHostSpeciesId ?? void 0,
        avoidEnzymes: sourceInput.avoidEnzymes ?? void 0,
        retainEnzymes: sourceInput.retainEnzymes ?? void 0
      });
      return { sourceJobId: input.jobId, newJobId: rerun.jobId, failed: rerun.failed };
    }),
    recentOptimizedResults: publicProcedure.input(z.object({ limit: z.number().min(1).max(500).optional() }).optional()).query(async ({ input }) => {
      const limit = input?.limit ?? 200;
      return listRecentOptimizedSequences(limit);
    })
  }),
  primers: router({
    analyzeRepeats: publicProcedure.input(
      z.object({
        items: z.array(
          z.object({
            rowId: z.number(),
            geneName: z.string().optional(),
            sequence: z.string().optional()
          })
        ).max(1e3)
      })
    ).query(async ({ input }) => {
      return input.items.map((item) => {
        const sequence = normalizeDnaLike(item.sequence ?? "");
        return {
          rowId: item.rowId,
          geneName: item.geneName ?? "",
          sequence,
          repeatStats: sequence ? analyzeRepeatStats(sequence) : null
        };
      });
    }),
    design: publicProcedure.input(
      z.object({
        geneName: nonEmptyText,
        targetSequence: nonEmptyText,
        mode: primerMode,
        leftArm: z.string().optional().nullable(),
        rightArm: z.string().optional().nullable(),
        params: z.record(z.string(), z.any()).optional().default({})
      })
    ).mutation(async ({ input }) => {
      const runId = nanoid(12);
      const createdAt = /* @__PURE__ */ new Date();
      try {
        const built = buildTemplate(input.targetSequence, input.leftArm, input.rightArm);
        const targetStart = built.leftArm.length;
        const targetEnd = built.leftArm.length + built.target.length;
        const output = input.mode === "pcr" ? (() => {
          const primers = designPCRPrimers(built.template, targetStart, targetEnd, input.params);
          if (!primers) {
            return {
              ok: false,
              error: explainPCRDesignFailure(built.template, targetStart, targetEnd, input.params)
            };
          }
          return { ok: true, primers };
        })() : input.mode === "sequencing" ? (() => {
          const primers = designSequencingPrimers(built.template, targetStart, targetEnd, input.params);
          if (!primers) {
            return {
              ok: false,
              error: explainSequencingDesignFailure(built.template, targetStart, targetEnd, input.params)
            };
          }
          return { ok: true, primers };
        })() : (() => {
          const oligos = designSynthesisOligos(built.template, input.params);
          if (!oligos) {
            return { ok: false, error: explainSynthesisDesignFailure(built.template, input.params) };
          }
          return { ok: true, oligos };
        })();
        await insertPrimerDesignRun({
          runId,
          mode: "single",
          armPolicy: built.leftArm || built.rightArm ? "batch_default" : "none",
          input: { ...input, template: built.template, targetStart, targetEnd },
          output,
          status: "success",
          createdAt
        });
        return { runId, createdAt, output };
      } catch (e) {
        const errorMessage = e?.message ?? "\u5F15\u7269\u8BBE\u8BA1\u5931\u8D25";
        await insertPrimerDesignRun({
          runId,
          mode: "single",
          armPolicy: "none",
          input,
          output: null,
          status: "failed",
          errorMessage,
          createdAt
        });
        throw e;
      }
    }),
    designBatch: publicProcedure.input(
      z.object({
        mode: primerMode,
        batchLeftArm: z.string().optional().nullable(),
        batchRightArm: z.string().optional().nullable(),
        items: z.array(
          z.object({
            geneName: nonEmptyText,
            targetSequence: nonEmptyText,
            leftArm: z.string().optional().nullable(),
            rightArm: z.string().optional().nullable()
          })
        ).min(1),
        params: z.record(z.string(), z.any()).optional().default({})
      })
    ).mutation(async ({ input }) => {
      const runId = nanoid(12);
      const createdAt = /* @__PURE__ */ new Date();
      try {
        const defaultLeft = input.batchLeftArm ?? "";
        const defaultRight = input.batchRightArm ?? "";
        const results = input.items.map((item) => {
          const leftArm = item.leftArm ?? defaultLeft;
          const rightArm = item.rightArm ?? defaultRight;
          const built = buildTemplate(item.targetSequence, leftArm, rightArm);
          const targetStart = built.leftArm.length;
          const targetEnd = built.leftArm.length + built.target.length;
          const output = input.mode === "pcr" ? (() => {
            const primers = designPCRPrimers(built.template, targetStart, targetEnd, input.params);
            if (!primers) {
              return {
                ok: false,
                error: explainPCRDesignFailure(built.template, targetStart, targetEnd, input.params)
              };
            }
            return { ok: true, primers };
          })() : input.mode === "sequencing" ? (() => {
            const primers = designSequencingPrimers(built.template, targetStart, targetEnd, input.params);
            if (!primers) {
              return {
                ok: false,
                error: explainSequencingDesignFailure(built.template, targetStart, targetEnd, input.params)
              };
            }
            return { ok: true, primers };
          })() : (() => {
            const oligos = designSynthesisOligos(built.template, input.params);
            if (!oligos) {
              return { ok: false, error: explainSynthesisDesignFailure(built.template, input.params) };
            }
            return { ok: true, oligos };
          })();
          return {
            geneName: item.geneName,
            leftArm: built.leftArm,
            rightArm: built.rightArm,
            targetSequence: built.target,
            templateLength: built.template.length,
            output
          };
        });
        const hasDefaultArms = normalizeDnaLike(defaultLeft).length > 0 || normalizeDnaLike(defaultRight).length > 0;
        const hasRowArms = input.items.some((x) => (x.leftArm ?? "").trim() || (x.rightArm ?? "").trim());
        const armPolicy = hasDefaultArms && hasRowArms ? "mixed" : hasRowArms ? "row_override" : hasDefaultArms ? "batch_default" : "none";
        await insertPrimerDesignRun({
          runId,
          mode: "batch",
          armPolicy,
          input,
          output: { results },
          status: "success",
          createdAt
        });
        return { runId, createdAt, output: { results } };
      } catch (e) {
        const errorMessage = e?.message ?? "\u6279\u91CF\u5F15\u7269\u8BBE\u8BA1\u5931\u8D25";
        await insertPrimerDesignRun({
          runId,
          mode: "batch",
          armPolicy: "none",
          input,
          output: null,
          status: "failed",
          errorMessage,
          createdAt
        });
        throw e;
      }
    }),
    synthesisBatchDesign: publicProcedure.input(
      z.object({
        items: z.array(
          z.object({
            geneName: nonEmptyText,
            sequence: nonEmptyText,
            leftArm: z.string().optional().nullable(),
            rightArm: z.string().optional().nullable()
          })
        ).min(1),
        params: z.object({
          synthesisOligoLength: z.number().optional(),
          synthesisMinOverlap: z.number().optional(),
          synthesisMaxOverlap: z.number().optional()
        }).optional().default({})
      })
    ).mutation(async ({ input }) => {
      const runId = nanoid(12);
      const createdAt = /* @__PURE__ */ new Date();
      try {
        const results = input.items.map((item) => {
          const built = buildTemplate(item.sequence, item.leftArm ?? null, item.rightArm ?? null);
          const designed = designSynthesisOligos(built.template, input.params);
          if (!designed) {
            return {
              geneName: item.geneName,
              success: false,
              primerType: "synthesis",
              error: explainSynthesisDesignFailure(built.template, input.params)
            };
          }
          return {
            geneName: item.geneName,
            success: true,
            primerType: "synthesis",
            synthesisOligos: designed.oligos,
            synthesisMeta: {
              globalScore: designed.globalScore,
              avgOverlapTmDelta: designed.avgOverlapTmDelta,
              maxSelfDimer: designed.maxSelfDimer,
              maxHairpin: designed.maxHairpin
            }
          };
        });
        const hasArms = input.items.some((x) => (x.leftArm ?? "").trim() || (x.rightArm ?? "").trim());
        await insertPrimerDesignRun({
          runId,
          mode: input.items.length > 1 ? "batch" : "single",
          armPolicy: hasArms ? "row_override" : "none",
          input,
          output: { results },
          status: "success",
          createdAt
        });
        return { runId, createdAt, results };
      } catch (e) {
        const errorMessage = e?.message ?? "\u57FA\u56E0\u5408\u6210\u5F15\u7269\u8BBE\u8BA1\u5931\u8D25";
        await insertPrimerDesignRun({
          runId,
          mode: input.items.length > 1 ? "batch" : "single",
          armPolicy: "none",
          input,
          output: null,
          status: "failed",
          errorMessage,
          createdAt
        });
        throw e;
      }
    })
  }),
  history: router({
    list: publicProcedure.input(
      z.object({
        type: z.enum(["all", "optimization", "primer_design"]).optional().default("all"),
        limit: z.number().min(1).max(200).optional().default(50)
      })
    ).query(async ({ input }) => {
      return listRuns(input);
    }),
    get: publicProcedure.input(z.object({ type: z.enum(["optimization", "primer_design"]), runId: nonEmptyText })).query(async ({ input }) => {
      return getRunByTypeAndId(input.type, input.runId);
    }),
    delete: publicProcedure.input(z.object({ type: z.enum(["optimization", "primer_design"]), runId: nonEmptyText })).mutation(async ({ input }) => {
      await deleteRunByTypeAndId(input.type, input.runId);
      return { ok: true };
    }),
    clear: publicProcedure.input(z.object({ type: z.enum(["all", "optimization", "primer_design"]).optional().default("all") })).mutation(async ({ input }) => {
      await clearRuns(input.type);
      return { ok: true };
    })
  })
});

// server/_core/context.ts
async function createContext(opts) {
  return {
    req: opts.req,
    res: opts.res
  };
}

// server/_core/vite.ts
import express from "express";
import fs2 from "fs";
import { nanoid as nanoid2 } from "nanoid";
import path3 from "path";
async function setupVite(app2, server) {
  const viteModule = await new Function("return import('vite')")();
  const createViteServer = viteModule.createServer;
  const viteConfigModule = await new Function(
    "return import('../../vite.config')"
  )();
  const { default: viteConfig } = viteConfigModule;
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true
  };
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom"
  });
  app2.use(vite.middlewares);
  app2.use("*", async (req, res, next) => {
    const url = req.originalUrl;
    try {
      const clientTemplate = path3.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );
      let template = await fs2.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid2()}"`
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e);
      next(e);
    }
  });
}
function serveStatic(app2) {
  const distPath = process.env.NODE_ENV === "development" ? path3.resolve(import.meta.dirname, "../..", "dist", "public") : path3.resolve(import.meta.dirname, "..", "dist", "public");
  if (!fs2.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }
  app2.use(express.static(distPath));
  app2.use("*", (req, res, next) => {
    const url = req.originalUrl || req.url || "";
    if (url.startsWith("/api/")) {
      return next();
    }
    res.sendFile(path3.resolve(distPath, "index.html"));
  });
}

// server/seed.ts
import { sql as sql2 } from "drizzle-orm";
var HOST_SPECIES_DATA = [
  { name: "E. coli", scientificName: "Escherichia coli", category: "bacteria" },
  { name: "S. cerevisiae", scientificName: "Saccharomyces cerevisiae", category: "yeast" },
  { name: "H. sapiens", scientificName: "Homo sapiens", category: "mammalian" },
  { name: "E. coli K-12", scientificName: "Escherichia coli K-12", category: "bacteria" },
  { name: "E. coli BL21", scientificName: "Escherichia coli BL21", category: "bacteria" },
  { name: "B. subtilis", scientificName: "Bacillus subtilis", category: "bacteria" },
  { name: "P. pastoris", scientificName: "Komagataella phaffii", category: "yeast" },
  { name: "K. lactis", scientificName: "Kluyveromyces lactis", category: "yeast" },
  { name: "CHO", scientificName: "Chinese Hamster Ovary cells", category: "mammalian" },
  { name: "HEK293", scientificName: "Human embryonic kidney 293 cells", category: "mammalian" },
  { name: "HeLa", scientificName: "Henrietta Lacks cells", category: "mammalian" },
  { name: "Sf9", scientificName: "Spodoptera frugiperda", category: "insect" },
  { name: "Sf21", scientificName: "Spodoptera frugiperda", category: "insect" },
  { name: "High Five", scientificName: "Trichoplusia ni", category: "insect" },
  { name: "Arabidopsis", scientificName: "Arabidopsis thaliana", category: "plant" },
  { name: "N. benthamiana", scientificName: "Nicotiana benthamiana", category: "plant" }
];
var ENZYMES_DATA = [
  { name: "EcoRI", recognitionSequence: "GAATTC", cutPattern: "5'---G^AATTC---3'", overhang: "5_prime", isCommon: true },
  { name: "BamHI", recognitionSequence: "GGATCC", cutPattern: "5'---G^GATCC---3'", overhang: "5_prime", isCommon: true },
  { name: "HindIII", recognitionSequence: "AAGCTT", cutPattern: "5'---A^AGCTT---3'", overhang: "5_prime", isCommon: true },
  { name: "XhoI", recognitionSequence: "CTCGAG", cutPattern: "5'---C^TCGAG---3'", overhang: "5_prime", isCommon: true },
  { name: "NdeI", recognitionSequence: "CATATG", cutPattern: "5'---CA^TATG---3'", overhang: "5_prime", isCommon: true },
  { name: "NcoI", recognitionSequence: "CCATGG", cutPattern: "5'---C^CATGG---3'", overhang: "5_prime", isCommon: true },
  { name: "XbaI", recognitionSequence: "TCTAGA", cutPattern: "5'---T^CTAGA---3'", overhang: "5_prime", isCommon: true },
  { name: "SalI", recognitionSequence: "GTCGAC", cutPattern: "5'---G^TCGAC---3'", overhang: "5_prime", isCommon: true },
  { name: "PstI", recognitionSequence: "CTGCAG", cutPattern: "5'---CTGCA^G---3'", overhang: "3_prime", isCommon: true },
  { name: "SphI", recognitionSequence: "GCATGC", cutPattern: "5'---GCATG^C---3'", overhang: "3_prime", isCommon: true },
  { name: "KpnI", recognitionSequence: "GGTACC", cutPattern: "5'---GGTAC^C---3'", overhang: "3_prime", isCommon: true },
  { name: "SacI", recognitionSequence: "GAGCTC", cutPattern: "5'---GAGCT^C---3'", overhang: "3_prime", isCommon: true },
  { name: "NotI", recognitionSequence: "GCGGCCGC", cutPattern: "5'---GC^GGCCGC---3'", overhang: "5_prime", isCommon: true },
  { name: "SmaI", recognitionSequence: "CCCGGG", cutPattern: "5'---CCC^GGG---3'", overhang: "blunt", isCommon: true },
  { name: "EcoRV", recognitionSequence: "GATATC", cutPattern: "5'---GAT^ATC---3'", overhang: "blunt", isCommon: true },
  { name: "BglII", recognitionSequence: "AGATCT", cutPattern: "5'---A^GATCT---3'", overhang: "5_prime", isCommon: true },
  { name: "ClaI", recognitionSequence: "ATCGAT", cutPattern: "5'---AT^CGAT---3'", overhang: "5_prime", isCommon: false },
  { name: "ApaI", recognitionSequence: "GGGCCC", cutPattern: "5'---GGGCC^C---3'", overhang: "3_prime", isCommon: false },
  { name: "SpeI", recognitionSequence: "ACTAGT", cutPattern: "5'---A^CTAGT---3'", overhang: "5_prime", isCommon: false },
  { name: "NheI", recognitionSequence: "GCTAGC", cutPattern: "5'---G^CTAGC---3'", overhang: "5_prime", isCommon: true },
  { name: "AgeI", recognitionSequence: "ACCGGT", cutPattern: "5'---A^CCGGT---3'", overhang: "5_prime", isCommon: false },
  { name: "AvrII", recognitionSequence: "CCTAGG", cutPattern: "5'---C^CTAGG---3'", overhang: "5_prime", isCommon: false },
  { name: "MluI", recognitionSequence: "ACGCGT", cutPattern: "5'---A^CGCGT---3'", overhang: "5_prime", isCommon: false },
  { name: "AflII", recognitionSequence: "CTTAAG", cutPattern: "5'---C^TTAAG---3'", overhang: "5_prime", isCommon: false },
  { name: "BsaI", recognitionSequence: "GGTCTC", cutPattern: void 0, overhang: void 0, isCommon: true },
  { name: "BsmBI", recognitionSequence: "CGTCTC", cutPattern: void 0, overhang: void 0, isCommon: true },
  { name: "BbsI", recognitionSequence: "GAAGAC", cutPattern: void 0, overhang: void 0, isCommon: false },
  { name: "SapI", recognitionSequence: "GCTCTTC", cutPattern: void 0, overhang: void 0, isCommon: false }
];
async function seedDatabaseIfEmpty() {
  try {
    const db = await getDb();
    const hostCount = await db.select({ count: sql2`count(*)` }).from(hostSpecies);
    if (Number(hostCount[0]?.count ?? 0) === 0) {
      console.log("[Seed] Inserting default host species...");
      for (let i = 0; i < HOST_SPECIES_DATA.length; i++) {
        const s = HOST_SPECIES_DATA[i];
        const tableKey = HOST_TO_TABLE[s.name];
        const codonTable = tableKey ? CODON_TABLES[tableKey] : null;
        await db.insert(hostSpecies).values({
          name: s.name,
          scientificName: s.scientificName,
          category: s.category,
          sortOrder: i,
          codonTable,
          isActive: true,
          updatedAt: /* @__PURE__ */ new Date()
        }).onConflictDoNothing();
      }
      console.log(`[Seed] Inserted ${HOST_SPECIES_DATA.length} host species`);
    } else {
      console.log(`[Seed] Host species already seeded (${hostCount[0]?.count} rows)`);
    }
    const enzymeCount = await db.select({ count: sql2`count(*)` }).from(restrictionEnzymes);
    if (Number(enzymeCount[0]?.count ?? 0) === 0) {
      console.log("[Seed] Inserting default restriction enzymes...");
      for (const e of ENZYMES_DATA) {
        await db.insert(restrictionEnzymes).values({
          name: e.name,
          recognitionSequence: e.recognitionSequence,
          cutPattern: e.cutPattern ?? null,
          overhang: e.overhang,
          isCommon: e.isCommon,
          updatedAt: /* @__PURE__ */ new Date()
        }).onConflictDoNothing();
      }
      console.log(`[Seed] Inserted ${ENZYMES_DATA.length} restriction enzymes`);
    } else {
      console.log(`[Seed] Restriction enzymes already seeded (${enzymeCount[0]?.count} rows)`);
    }
  } catch (err) {
    console.error("[Seed] Failed to seed database:", err?.message ?? err);
  }
}

// server/_core/index.ts
function loadEnv() {
  const here = path4.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path4.resolve(process.cwd(), ".env"),
    path4.resolve(here, "../.env"),
    path4.resolve(here, "../../.env"),
    path4.resolve(here, "../../../.env")
  ];
  for (const candidate of candidates) {
    if (fs3.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
  }
  dotenv.config();
  return null;
}
loadEnv();
function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}
async function findAvailablePort(startPort = 3e3) {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}
async function startServer() {
  const app2 = express2();
  const server = createServer(app2);
  app2.use(express2.json({ limit: "50mb" }));
  app2.use(express2.urlencoded({ limit: "50mb", extended: true }));
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app2.post("/api/vectors/parse-sequence-file", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "\u672A\u9009\u62E9\u6587\u4EF6" });
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength
      );
      const seqs = await parseFile(" ", { source: arrayBuffer, fileName: file.originalname });
      const sequences = seqs.map((s) => ({
        name: s.name || file.originalname.replace(/\.[^.]+$/, "") || "Untitled",
        sequence: s.seq
      }));
      res.json({ sequences });
    } catch (e) {
      res.status(400).json({ error: e?.message ?? "\u89E3\u6790\u5931\u8D25" });
    }
  });
  app2.post("/api/vectors/parse-sequence-text", express2.json({ limit: "10mb" }), async (req, res) => {
    try {
      const { content, fileName } = req.body;
      if (!content || typeof content !== "string" || !fileName || typeof fileName !== "string") {
        return res.status(400).json({ error: "\u7F3A\u5C11 content \u6216 fileName" });
      }
      const seqs = await parseFile(content.trim() || " ", { fileName });
      const sequences = seqs.map((s) => ({
        name: s.name || fileName.replace(/\.[^.]+$/, "") || "Untitled",
        sequence: s.seq
      }));
      res.json({ sequences });
    } catch (e) {
      res.status(400).json({ error: e?.message ?? "\u89E3\u6790\u5931\u8D25" });
    }
  });
  app2.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext
    })
  );
  if (process.env.NODE_ENV === "development") {
    await setupVite(app2, server);
  } else {
    serveStatic(app2);
  }
  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);
  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }
  return new Promise((resolve) => {
    server.listen(port, async () => {
      console.log(`Server running on http://localhost:${port}/`);
      await initDb();
      await seedDatabaseIfEmpty();
      resolve({ port });
    });
  });
}
if (!process.versions.electron) {
  startServer().catch(console.error);
}

// electron/main.ts
var isDev = process.env.NODE_ENV === "development" || !app.isPackaged;
var mainWindow = null;
var serverPort = null;
async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "\u5BC6\u7801\u5B50\u4F18\u5316\u4E0E\u5F15\u7269\u5408\u6210",
    webPreferences: {
      preload: path5.join(import.meta.dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  const serverUrl = `http://localhost:${port}`;
  await mainWindow.loadURL(serverUrl);
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
app.whenReady().then(async () => {
  if (!process.env.PGLITE_DATA_DIR) {
    process.env.PGLITE_DATA_DIR = path5.join(app.getPath("userData"), "pglite-data");
  }
  if (!process.env.DNAWORKS_EXECUTABLE_PATH) {
    const dnaworksPath = isDev ? path5.resolve(import.meta.dirname, "..", "bin", "dnaworks-mac") : path5.join(process.resourcesPath, "bin", "dnaworks-mac");
    process.env.DNAWORKS_EXECUTABLE_PATH = dnaworksPath;
  }
  const { port } = await startServer();
  serverPort = port;
  await createWindow(port);
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && serverPort) {
    createWindow(serverPort);
  }
});
ipcMain.handle("app:get-version", () => app.getVersion());
ipcMain.handle("app:open-external", (_event, url) => shell.openExternal(url));
