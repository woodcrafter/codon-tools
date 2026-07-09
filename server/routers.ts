import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { router, publicProcedure } from "./_core/trpc";
import * as db from "./db";
import {
  analyzeCodonUsage,
  analyzeRepeatStats,
  scoreDnaSequence,
} from "./codonOptimization";
import { optimizeByStrategy } from "./codonOptimizationStrategy";
import {
  designPCRPrimers,
  designSequencingPrimers,
  designSynthesisOligos,
  explainPCRDesignFailure,
  explainSequencingDesignFailure,
  explainSynthesisDesignFailure,
} from "./primerDesign";

const nonEmptyText = z.string().trim().min(1);

const dnaOrProteinText = z
  .string()
  .transform((v: string) => v.trim())
  .refine((v: string) => v.length > 0, "序列不能为空");

const primerMode = z.enum(["pcr", "sequencing", "synthesis"]);

function normalizeDnaLike(input: string) {
  return input.toUpperCase().replace(/\s/g, "");
}

function buildTemplate(target: string, leftArm?: string | null, rightArm?: string | null) {
  const left = normalizeDnaLike(leftArm ?? "");
  const right = normalizeDnaLike(rightArm ?? "");
  const core = normalizeDnaLike(target);
  return {
    template: `${left}${core}${right}`,
    leftArm: left,
    rightArm: right,
    target: core,
  };
}

async function executeOptimizationBatchCompat(input: {
  items: Array<{
    geneName: string;
    cdsSequence: string;
    fivePrimeFlank?: string;
    threePrimeFlank?: string;
  }>;
  hostSpeciesId: number;
  secondaryHostSpeciesId?: number;
  avoidEnzymes?: string[];
  retainEnzymes?: string[];
}) {
  const runId = nanoid(12);
  const createdAt = new Date();
  const host = await db.getHostSpeciesById(input.hostSpeciesId);
  if (!host) throw new Error("宿主物种不存在");
  const secondaryHost = input.secondaryHostSpeciesId
    ? await db.getHostSpeciesById(input.secondaryHostSpeciesId)
    : null;

  const results = await Promise.all(
    input.items.map(async (item, index) => {
      const optimized = await optimizeByStrategy(item.cdsSequence, {
        hostSpecies: host.name,
        codonTable: (host.codonTable ?? undefined) as any,
        avoidEnzymes: input.avoidEnzymes,
        retainEnzymes: input.retainEnzymes,
        eliminateRepeats: true,
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
        repeatStats: optimized.repeatStats,
      };
    })
  );

  await db.insertOptimizationRun({
    runId,
    mode: "batch",
    input: {
      ...input,
      hostSpeciesName: host.name,
      secondaryHostSpeciesName: secondaryHost?.name ?? null,
      createdAt,
    },
    output: { results },
    status: "success",
    createdAt,
  });

  return {
    jobId: runId,
    createdAt,
    failed: 0,
    results,
  };
}

async function getOptimizationJobCompat(runId: string) {
  const run = await db.getRunByTypeAndId("optimization", runId);
  if (!run) return null;
  const input = (run.input ?? {}) as any;
  const output = (run.output ?? {}) as any;
  const results = Array.isArray(output.results)
    ? output.results.map((result: any) => ({
        ...result,
        repeatStats:
          result?.repeatStats ??
          (result?.optimizedSequence ? analyzeRepeatStats(result.optimizedSequence) : null),
      }))
    : [];
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
    input,
  };
  return { job, results };
}

export const appRouter = router({
  hosts: router({
    list: publicProcedure.query(async () => {
      return db.listHostSpecies();
    }),
    reorder: publicProcedure
      .input(
        z.object({
          orderedIds: z.array(z.number()).min(1),
        })
      )
      .mutation(async ({ input }) => {
        await db.saveHostSpeciesOrder(input.orderedIds);
        return { ok: true };
      }),
    upsert: publicProcedure
      .input(
        z.object({
          id: z.number().optional(),
          name: nonEmptyText,
          scientificName: z.string().trim().optional().nullable(),
          category: z.string().trim().optional().nullable(),
          sortOrder: z.number().optional().nullable(),
          codonTable: z.any().optional().nullable(),
          isActive: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.upsertHostSpecies(input);
      }),
    delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteHostSpecies(input.id);
      return { ok: true };
    }),
  }),
  enzymes: router({
    list: publicProcedure.query(async () => {
      return db.listRestrictionEnzymes();
    }),
    upsert: publicProcedure
      .input(
        z.object({
          id: z.number().optional(),
          name: nonEmptyText,
          recognitionSequence: nonEmptyText,
          cutPattern: z.string().trim().optional().nullable(),
          overhang: z.enum(["blunt", "5_prime", "3_prime"]).optional().nullable(),
          methylationSensitivity: z.string().trim().optional().nullable(),
          isCommon: z.boolean().optional(),
        })
      )
      .mutation(async ({ input }) => {
        return db.upsertRestrictionEnzyme(input);
      }),
    delete: publicProcedure.input(z.object({ id: z.number() })).mutation(async ({ input }) => {
      await db.deleteRestrictionEnzyme(input.id);
      return { ok: true };
    }),
  }),
  optimization: router({
    run: publicProcedure
      .input(
        z.object({
          sequence: dnaOrProteinText,
          hostSpeciesId: z.number(),
          avoidSites: z.array(nonEmptyText).optional().default([]),
          targetGcMin: z.number().optional(),
          targetGcMax: z.number().optional(),
          eliminateRepeats: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const runId = nanoid(12);
        const createdAt = new Date();
        try {
          const host = await db.getHostSpeciesById(input.hostSpeciesId);
          if (!host) throw new Error("宿主物种不存在");

          const result = await optimizeByStrategy(input.sequence, {
            hostSpecies: host.name,
            codonTable: (host.codonTable ?? undefined) as any,
            avoidEnzymes: input.avoidSites,
            targetGcMin: input.targetGcMin,
            targetGcMax: input.targetGcMax,
            eliminateRepeats: input.eliminateRepeats,
          });

          const output = {
            ...result,
            score: scoreDnaSequence(result.optimizedSequence, host.name, (host.codonTable ?? undefined) as any),
            codonUsage: analyzeCodonUsage(result.optimizedSequence),
          };

          await db.insertOptimizationRun({
            runId,
            mode: "single",
            input: { ...input, hostSpeciesName: host.name },
            output,
            status: "success",
            createdAt,
          });

          return { runId, createdAt, output };
        } catch (e: any) {
          const errorMessage = e?.message ?? "优化失败";
          await db.insertOptimizationRun({
            runId,
            mode: "single",
            input,
            output: null,
            status: "failed",
            errorMessage,
            createdAt,
          });
          throw e;
        }
      }),
    runBatch: publicProcedure
      .input(
        z.object({
          items: z
            .array(
              z.object({
                geneName: nonEmptyText,
                sequence: dnaOrProteinText,
              })
            )
            .min(1),
          hostSpeciesId: z.number(),
          avoidSites: z.array(nonEmptyText).optional().default([]),
          targetGcMin: z.number().optional(),
          targetGcMax: z.number().optional(),
          eliminateRepeats: z.boolean().optional().default(true),
        })
      )
      .mutation(async ({ input }) => {
        const runId = nanoid(12);
        const createdAt = new Date();
        try {
          const host = await db.getHostSpeciesById(input.hostSpeciesId);
          if (!host) throw new Error("宿主物种不存在");

          const results = await Promise.all(
            input.items.map(async (item) => {
              const output = await optimizeByStrategy(item.sequence, {
                hostSpecies: host.name,
                codonTable: (host.codonTable ?? undefined) as any,
                avoidEnzymes: input.avoidSites,
                targetGcMin: input.targetGcMin,
                targetGcMax: input.targetGcMax,
                eliminateRepeats: input.eliminateRepeats,
              });
              return { geneName: item.geneName, inputSequence: item.sequence, ...output };
            })
          );

          await db.insertOptimizationRun({
            runId,
            mode: "batch",
            input: { ...input, hostSpeciesName: host.name },
            output: { results },
            status: "success",
            createdAt,
          });

          return { runId, createdAt, output: { results } };
        } catch (e: any) {
          const errorMessage = e?.message ?? "批量优化失败";
          await db.insertOptimizationRun({
            runId,
            mode: "batch",
            input,
            output: null,
            status: "failed",
            errorMessage,
            createdAt,
          });
          throw e;
        }
      }),
  }),
  optimizationJobs: router({
    runBatch: publicProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              geneName: z.string(),
              cdsSequence: z.string(),
              fivePrimeFlank: z.string().optional(),
              threePrimeFlank: z.string().optional(),
            })
          ),
          hostSpeciesId: z.number(),
          secondaryHostSpeciesId: z.number().optional(),
          avoidEnzymes: z.array(z.string()).optional(),
          retainEnzymes: z.array(z.string()).optional(),
        })
      )
      .mutation(async ({ input }) => {
        return executeOptimizationBatchCompat(input);
      }),
    list: publicProcedure.query(async () => {
      const runs = await db.listRuns({ type: "optimization", limit: 200 });
      return runs
        .filter((r: any) => r.mode === "batch")
        .map((r: any) => {
          const input = (r.input ?? {}) as any;
          const output = (r.output ?? {}) as any;
          const results = Array.isArray(output.results) ? output.results : [];
          return {
            jobId: r.runId,
            createdAt: r.createdAt,
            firstGeneName: results[0]?.geneName ?? null,
            resultCount: results.length,
            hostSpeciesId: input.hostSpeciesId ?? null,
            secondaryHostSpeciesId: input.secondaryHostSpeciesId ?? null,
            avoidEnzymes: input.avoidEnzymes ?? [],
            retainEnzymes: input.retainEnzymes ?? [],
          };
        });
    }),
    getByJobId: publicProcedure
      .input(z.object({ jobId: z.string() }))
      .query(async ({ input }) => {
        const found = await getOptimizationJobCompat(input.jobId);
        if (!found) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Optimization job not found" });
        }
        return found;
      }),
    rerunByJobId: publicProcedure
      .input(z.object({ jobId: z.string() }))
      .mutation(async ({ input }) => {
        const found = await getOptimizationJobCompat(input.jobId);
        if (!found) {
          throw new TRPCError({ code: "NOT_FOUND", message: "Optimization job not found" });
        }
        const sourceInput = found.job.input ?? {};
        const items = Array.isArray(sourceInput.items) ? sourceInput.items : [];
        const rerun = await executeOptimizationBatchCompat({
          items,
          hostSpeciesId: sourceInput.hostSpeciesId,
          secondaryHostSpeciesId: sourceInput.secondaryHostSpeciesId ?? undefined,
          avoidEnzymes: sourceInput.avoidEnzymes ?? undefined,
          retainEnzymes: sourceInput.retainEnzymes ?? undefined,
        });
        return { sourceJobId: input.jobId, newJobId: rerun.jobId, failed: rerun.failed };
      }),
    recentOptimizedResults: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(500).optional() }).optional())
      .query(async ({ input }) => {
        const limit = input?.limit ?? 200;
        return db.listRecentOptimizedSequences(limit);
      }),
  }),
  primers: router({
    analyzeRepeats: publicProcedure
      .input(
        z.object({
          items: z.array(
            z.object({
              rowId: z.number(),
              geneName: z.string().optional(),
              sequence: z.string().optional(),
            })
          ).max(1000),
        })
      )
      .query(async ({ input }) => {
        return input.items.map((item) => {
          const sequence = normalizeDnaLike(item.sequence ?? "");
          return {
            rowId: item.rowId,
            geneName: item.geneName ?? "",
            sequence,
            repeatStats: sequence ? analyzeRepeatStats(sequence) : null,
          };
        });
      }),
    design: publicProcedure
      .input(
        z.object({
          geneName: nonEmptyText,
          targetSequence: nonEmptyText,
          mode: primerMode,
          leftArm: z.string().optional().nullable(),
          rightArm: z.string().optional().nullable(),
          params: z.record(z.string(), z.any()).optional().default({}),
        })
      )
      .mutation(async ({ input }) => {
        const runId = nanoid(12);
        const createdAt = new Date();
        try {
          const built = buildTemplate(input.targetSequence, input.leftArm, input.rightArm);
          const targetStart = built.leftArm.length;
          const targetEnd = built.leftArm.length + built.target.length;

          const output =
            input.mode === "pcr"
              ? (() => {
                  const primers = designPCRPrimers(built.template, targetStart, targetEnd, input.params as any);
                  if (!primers) {
                    return {
                      ok: false,
                      error: explainPCRDesignFailure(built.template, targetStart, targetEnd, input.params as any),
                    };
                  }
                  return { ok: true, primers };
                })()
              : input.mode === "sequencing"
                ? (() => {
                    const primers = designSequencingPrimers(built.template, targetStart, targetEnd, input.params as any);
                    if (!primers) {
                      return {
                        ok: false,
                        error: explainSequencingDesignFailure(built.template, targetStart, targetEnd, input.params as any),
                      };
                    }
                    return { ok: true, primers };
                  })()
                : (() => {
                    const oligos = designSynthesisOligos(built.template, input.params as any);
                    if (!oligos) {
                      return { ok: false, error: explainSynthesisDesignFailure(built.template, input.params as any) };
                    }
                    return { ok: true, oligos };
                  })();

          await db.insertPrimerDesignRun({
            runId,
            mode: "single",
            armPolicy: (built.leftArm || built.rightArm) ? "batch_default" : "none",
            input: { ...input, template: built.template, targetStart, targetEnd },
            output,
            status: "success",
            createdAt,
          });

          return { runId, createdAt, output };
        } catch (e: any) {
          const errorMessage = e?.message ?? "引物设计失败";
          await db.insertPrimerDesignRun({
            runId,
            mode: "single",
            armPolicy: "none",
            input,
            output: null,
            status: "failed",
            errorMessage,
            createdAt,
          });
          throw e;
        }
      }),
    designBatch: publicProcedure
      .input(
        z.object({
          mode: primerMode,
          batchLeftArm: z.string().optional().nullable(),
          batchRightArm: z.string().optional().nullable(),
          items: z
            .array(
              z.object({
                geneName: nonEmptyText,
                targetSequence: nonEmptyText,
                leftArm: z.string().optional().nullable(),
                rightArm: z.string().optional().nullable(),
              })
            )
            .min(1),
          params: z.record(z.string(), z.any()).optional().default({}),
        })
      )
      .mutation(async ({ input }) => {
        const runId = nanoid(12);
        const createdAt = new Date();
        try {
          const defaultLeft = input.batchLeftArm ?? "";
          const defaultRight = input.batchRightArm ?? "";

          const results = input.items.map(item => {
            const leftArm = item.leftArm ?? defaultLeft;
            const rightArm = item.rightArm ?? defaultRight;
            const built = buildTemplate(item.targetSequence, leftArm, rightArm);
            const targetStart = built.leftArm.length;
            const targetEnd = built.leftArm.length + built.target.length;

            const output =
              input.mode === "pcr"
                ? (() => {
                    const primers = designPCRPrimers(built.template, targetStart, targetEnd, input.params as any);
                    if (!primers) {
                      return {
                        ok: false,
                        error: explainPCRDesignFailure(built.template, targetStart, targetEnd, input.params as any),
                      };
                    }
                    return { ok: true, primers };
                  })()
                : input.mode === "sequencing"
                  ? (() => {
                      const primers = designSequencingPrimers(built.template, targetStart, targetEnd, input.params as any);
                      if (!primers) {
                        return {
                          ok: false,
                          error: explainSequencingDesignFailure(built.template, targetStart, targetEnd, input.params as any),
                        };
                      }
                      return { ok: true, primers };
                    })()
                  : (() => {
                      const oligos = designSynthesisOligos(built.template, input.params as any);
                      if (!oligos) {
                        return { ok: false, error: explainSynthesisDesignFailure(built.template, input.params as any) };
                      }
                      return { ok: true, oligos };
                    })();

            return {
              geneName: item.geneName,
              leftArm: built.leftArm,
              rightArm: built.rightArm,
              targetSequence: built.target,
              templateLength: built.template.length,
              output,
            };
          });

          const hasDefaultArms = normalizeDnaLike(defaultLeft).length > 0 || normalizeDnaLike(defaultRight).length > 0;
          const hasRowArms = input.items.some(x => (x.leftArm ?? "").trim() || (x.rightArm ?? "").trim());
          const armPolicy = hasDefaultArms && hasRowArms ? "mixed" : hasRowArms ? "row_override" : hasDefaultArms ? "batch_default" : "none";

          await db.insertPrimerDesignRun({
            runId,
            mode: "batch",
            armPolicy,
            input,
            output: { results },
            status: "success",
            createdAt,
          });

          return { runId, createdAt, output: { results } };
        } catch (e: any) {
          const errorMessage = e?.message ?? "批量引物设计失败";
          await db.insertPrimerDesignRun({
            runId,
            mode: "batch",
            armPolicy: "none",
            input,
            output: null,
            status: "failed",
            errorMessage,
            createdAt,
          });
          throw e;
        }
      }),
    synthesisBatchDesign: publicProcedure
      .input(
        z.object({
          items: z
            .array(
              z.object({
                geneName: nonEmptyText,
                sequence: nonEmptyText,
                leftArm: z.string().optional().nullable(),
                rightArm: z.string().optional().nullable(),
              })
            )
            .min(1),
          params: z
            .object({
              synthesisOligoLength: z.number().optional(),
              synthesisMinOverlap: z.number().optional(),
              synthesisMaxOverlap: z.number().optional(),
            })
            .optional()
            .default({}),
        })
      )
      .mutation(async ({ input }) => {
        const runId = nanoid(12);
        const createdAt = new Date();

        try {
          const results = input.items.map((item) => {
            const built = buildTemplate(item.sequence, item.leftArm ?? null, item.rightArm ?? null);
            const designed = designSynthesisOligos(built.template, input.params as any);
            if (!designed) {
              return {
                geneName: item.geneName,
                success: false,
                primerType: "synthesis" as const,
                error: explainSynthesisDesignFailure(built.template, input.params as any),
              };
            }
            return {
              geneName: item.geneName,
              success: true,
              primerType: "synthesis" as const,
              synthesisOligos: designed.oligos,
              synthesisMeta: {
                globalScore: designed.globalScore,
                avgOverlapTmDelta: designed.avgOverlapTmDelta,
                maxSelfDimer: designed.maxSelfDimer,
                maxHairpin: designed.maxHairpin,
              },
            };
          });

          const hasArms = input.items.some((x) => (x.leftArm ?? "").trim() || (x.rightArm ?? "").trim());
          await db.insertPrimerDesignRun({
            runId,
            mode: input.items.length > 1 ? "batch" : "single",
            armPolicy: hasArms ? "row_override" : "none",
            input,
            output: { results },
            status: "success",
            createdAt,
          });

          return { runId, createdAt, results };
        } catch (e: any) {
          const errorMessage = e?.message ?? "基因合成引物设计失败";
          await db.insertPrimerDesignRun({
            runId,
            mode: input.items.length > 1 ? "batch" : "single",
            armPolicy: "none",
            input,
            output: null,
            status: "failed",
            errorMessage,
            createdAt,
          });
          throw e;
        }
      }),
  }),
  history: router({
    list: publicProcedure
      .input(
        z.object({
          type: z.enum(["all", "optimization", "primer_design"]).optional().default("all"),
          limit: z.number().min(1).max(200).optional().default(50),
        })
      )
      .query(async ({ input }) => {
        return db.listRuns(input);
      }),
    get: publicProcedure
      .input(z.object({ type: z.enum(["optimization", "primer_design"]), runId: nonEmptyText }))
      .query(async ({ input }) => {
        return db.getRunByTypeAndId(input.type, input.runId);
      }),
    delete: publicProcedure
      .input(z.object({ type: z.enum(["optimization", "primer_design"]), runId: nonEmptyText }))
      .mutation(async ({ input }) => {
        await db.deleteRunByTypeAndId(input.type, input.runId);
        return { ok: true };
      }),
    clear: publicProcedure
      .input(z.object({ type: z.enum(["all", "optimization", "primer_design"]).optional().default("all") }))
      .mutation(async ({ input }) => {
        await db.clearRuns(input.type);
        return { ok: true };
      }),
  }),
});

export type AppRouter = typeof appRouter;
