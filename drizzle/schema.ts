import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const restrictionEnzymeOverhang = pgEnum("restriction_enzyme_overhang", [
  "blunt",
  "5_prime",
  "3_prime",
]);

export const hostSpecies = pgTable("host_species", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 100 }).notNull().unique(),
  scientificName: varchar("scientificName", { length: 200 }),
  category: varchar("category", { length: 50 }),
  sortOrder: integer("sortOrder").default(0).notNull(),
  codonTable: jsonb("codonTable"),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type HostSpecies = typeof hostSpecies.$inferSelect;
export type InsertHostSpecies = typeof hostSpecies.$inferInsert;

export const restrictionEnzymes = pgTable("restriction_enzymes", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 50 }).notNull().unique(),
  recognitionSequence: varchar("recognitionSequence", { length: 50 }).notNull(),
  cutPattern: varchar("cutPattern", { length: 100 }),
  overhang: restrictionEnzymeOverhang("overhang"),
  methylationSensitivity: varchar("methylationSensitivity", { length: 100 }),
  isCommon: boolean("isCommon").default(false).notNull(),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { mode: "date" })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

export type RestrictionEnzyme = typeof restrictionEnzymes.$inferSelect;
export type InsertRestrictionEnzyme = typeof restrictionEnzymes.$inferInsert;

export const runMode = pgEnum("run_mode", ["single", "batch"]);
export const runStatus = pgEnum("run_status", ["success", "failed"]);
export const primerArmPolicy = pgEnum("primer_arm_policy", [
  "none",
  "batch_default",
  "row_override",
  "mixed",
]);

export const optimizationRuns = pgTable("optimization_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("runId", { length: 50 }).notNull().unique(),
  mode: runMode("mode").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  status: runStatus("status").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export type OptimizationRun = typeof optimizationRuns.$inferSelect;
export type InsertOptimizationRun = typeof optimizationRuns.$inferInsert;

export const primerDesignRuns = pgTable("primer_design_runs", {
  id: serial("id").primaryKey(),
  runId: varchar("runId", { length: 50 }).notNull().unique(),
  mode: runMode("mode").notNull(),
  armPolicy: primerArmPolicy("armPolicy").default("none").notNull(),
  input: jsonb("input").notNull(),
  output: jsonb("output"),
  status: runStatus("status").notNull(),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt", { mode: "date" }).defaultNow().notNull(),
});

export type PrimerDesignRun = typeof primerDesignRuns.$inferSelect;
export type InsertPrimerDesignRun = typeof primerDesignRuns.$inferInsert;
