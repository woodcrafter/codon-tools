import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  analyzeRepeatStats,
  buildRetainConstraint,
  countRestrictionSiteOccurrences,
  optimizeSequence,
  optimizeSequenceAuto,
  raiseCaiAboveThreshold,
  resolveCodonTable,
  restoreProtectedCodons,
  scoreDnaSequence,
  type CodonTable,
  type RepeatStats,
} from "./codonOptimization";
import { ENV } from "./_core/env";

export const optimizationStrategies = ["dnaworks", "js"] as const;
export type OptimizationStrategy = (typeof optimizationStrategies)[number];

const MIN_ACCEPTABLE_CAI = 0.8;

type OptimizeParams = {
  hostSpecies: string;
  codonTable?: CodonTable;
  avoidEnzymes?: string[];
  retainEnzymes?: string[];
  sourceDnaSequence?: string;
  targetGcMin?: number;
  targetGcMax?: number;
  eliminateRepeats?: boolean;
};

type OptimizeResult = {
  optimizedSequence: string;
  cai: number;
  gcContent: number;
  changes: number;
  warnings: string[];
  repeatStats: RepeatStats;
};

const GENETIC_CODE: Record<string, string> = {
  TTT: "F", TTC: "F", TTA: "L", TTG: "L",
  TCT: "S", TCC: "S", TCA: "S", TCG: "S",
  TAT: "Y", TAC: "Y", TAA: "*", TAG: "*",
  TGT: "C", TGC: "C", TGA: "*", TGG: "W",
  CTT: "L", CTC: "L", CTA: "L", CTG: "L",
  CCT: "P", CCC: "P", CCA: "P", CCG: "P",
  CAT: "H", CAC: "H", CAA: "Q", CAG: "Q",
  CGT: "R", CGC: "R", CGA: "R", CGG: "R",
  ATT: "I", ATC: "I", ATA: "I", ATG: "M",
  ACT: "T", ACC: "T", ACA: "T", ACG: "T",
  AAT: "N", AAC: "N", AAA: "K", AAG: "K",
  AGT: "S", AGC: "S", AGA: "R", AGG: "R",
  GTT: "V", GTC: "V", GTA: "V", GTG: "V",
  GCT: "A", GCC: "A", GCA: "A", GCG: "A",
  GAT: "D", GAC: "D", GAA: "E", GAG: "E",
  GGT: "G", GGC: "G", GGA: "G", GGG: "G",
};

const AA_TO_CODONS = Object.entries(GENETIC_CODE).reduce<Record<string, string[]>>((acc, [codon, aa]) => {
  if (!acc[aa]) acc[aa] = [];
  acc[aa].push(codon);
  return acc;
}, {});

function calculateRepeatPenalty(sequence: string): number {
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  const minRepeatLength = 9;
  if (clean.length < minRepeatLength) return 0;

  const complement: Record<string, string> = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  const rc = (s: string) => s.split("").reverse().map((b) => complement[b] || b).join("");
  const canonical = (s: string) => {
    const reversed = rc(s);
    return s <= reversed ? s : reversed;
  };

  const count = new Map<string, number>();
  const windows: Array<{ start: number; key: string }> = [];
  for (let i = 0; i <= clean.length - minRepeatLength; i++) {
    const key = canonical(clean.slice(i, i + minRepeatLength));
    windows.push({ start: i, key });
    count.set(key, (count.get(key) || 0) + 1);
  }

  const mask = new Array<boolean>(clean.length).fill(false);
  for (const window of windows) {
    if ((count.get(window.key) || 0) < 2) continue;
    for (let p = window.start; p < window.start + minRepeatLength; p++) {
      mask[p] = true;
    }
  }

  const repeatedBases = mask.reduce((sum, flagged) => sum + (flagged ? 1 : 0), 0);
  return Math.min(1, repeatedBases / clean.length);
}

function hasAvoidEnzymeSite(sequence: string, avoidEnzymes: string[] = []): boolean {
  if (!avoidEnzymes.length) return false;
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  return avoidEnzymes.some((site) => {
    const normalized = (site || "").toUpperCase().trim();
    return normalized ? clean.includes(normalized) : false;
  });
}

function collectRepeatHotspotCodonIndexes(sequence: string): number[] {
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  const minRepeatLength = 9;
  if (clean.length < minRepeatLength) return [];

  const complement: Record<string, string> = { A: "T", T: "A", C: "G", G: "C", N: "N" };
  const rc = (s: string) => s.split("").reverse().map((b) => complement[b] || b).join("");
  const canonical = (s: string) => {
    const reversed = rc(s);
    return s <= reversed ? s : reversed;
  };

  const count = new Map<string, number>();
  const windows: Array<{ start: number; key: string }> = [];
  for (let i = 0; i <= clean.length - minRepeatLength; i++) {
    const key = canonical(clean.slice(i, i + minRepeatLength));
    windows.push({ start: i, key });
    count.set(key, (count.get(key) || 0) + 1);
  }

  const hotspotCodons = new Set<number>();
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

function replaceCodonAt(sequence: string, codonIndex: number, codon: string): string {
  const start = codonIndex * 3;
  return sequence.slice(0, start) + codon + sequence.slice(start + 3);
}

function polishRepeats(sequence: string, params: OptimizeParams): { sequence: string; changed: boolean; note?: string } {
  if (params.eliminateRepeats === false) {
    return { sequence, changed: false };
  }

  const baseline = scoreDnaSequence(sequence, params.hostSpecies, params.codonTable);
  let bestSequence = sequence.toUpperCase().replace(/\s/g, "");
  let bestPenalty = calculateRepeatPenalty(bestSequence);
  let bestCai = baseline.cai;
  const baselineHasAvoid = hasAvoidEnzymeSite(bestSequence, params.avoidEnzymes || []);
  const protectedCodonIndexes = new Set(
    params.sourceDnaSequence
      ? buildRetainConstraint(params.sourceDnaSequence, params.retainEnzymes).protectedCodonIndexes
      : []
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
      eliminateRepeats: true,
    }).optimizedSequence;

    const polishedPenalty = calculateRepeatPenalty(polished);
    if (polishedPenalty < bestPenalty) {
      bestSequence = polished;
      bestPenalty = polishedPenalty;
      bestCai = scoreDnaSequence(bestSequence, params.hostSpecies, params.codonTable).cai;
    }
  } catch {
    // Keep DNAWorks output if local polish fails.
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
      const aa = GENETIC_CODE[currentCodon];
      if (!aa || aa === "*") continue;

      const candidates = (AA_TO_CODONS[aa] || []).filter((candidate) => candidate !== currentCodon);
      if (!candidates.length) continue;

      let localBestSequence: string | null = null;
      let localBestPenalty = bestPenalty;
      let localBestCai = bestCai;

      for (const candidate of candidates) {
        const mutated = replaceCodonAt(bestSequence, codonIndex, candidate);
        if (baselineHasAvoid && hasAvoidEnzymeSite(mutated, params.avoidEnzymes || [])) {
          // Baseline already contains avoid sites; keep current behavior.
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
      note: `重复序列精修：惩罚 ${beforePenalty.toFixed(3)} -> ${bestPenalty.toFixed(3)}，CAI ${baseline.cai.toFixed(3)} -> ${bestCai.toFixed(3)}`,
    };
  }

  return { sequence, changed: false };
}

function countCodonChanges(source: string, target: string): number {
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

function runExecFile(command: string, args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd }, (error, stdout, stderr) => {
      if (error) {
        const detail = [
          `Command: ${command} ${args.join(" ")}`,
          `CWD: ${cwd}`,
          `Exit code: ${(error as NodeJS.ErrnoException).code || "unknown"}`,
          `Error: ${error.message}`,
          stderr?.trim() ? `Stderr: ${stderr.trim()}` : "Stderr: (empty)",
        ].join("\n");
        reject(new Error(detail));
        return;
      }
      resolve({ stdout: stdout ?? "", stderr: stderr ?? "" });
    });
  });
}

function extractOptimizedDna(content: string): string | null {
  const rawLines = content.split(/\r?\n/);
  const sequences: string[] = [];

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
  return candidate.length % 3 === 0 ? candidate : candidate.slice(0, candidate.length - (candidate.length % 3));
}

function wrapSequence(sequence: string, width = 60): string {
  const chunks: string[] = [];
  for (let i = 0; i < sequence.length; i += width) {
    chunks.push(sequence.slice(i, i + width));
  }
  return chunks.join("\n");
}

function buildInputTemplate(sequence: string): string {
  return [
    'title "CODON_TOOLS_DNAWORKS"',
    'logfile "LOGFILE.txt"',
    "timelimit 30",
    "solutions 1",
    "NUCLEOTIDE",
    wrapSequence(sequence),
    "//",
    "",
  ].join("\n");
}

// One-letter -> DNAWorks three-letter amino acid code. Stop codons map to "End"
// and are written as the residue "X" in the PROTEIN block (see DNAWorks input.f90).
const AA1_TO_AA3: Record<string, string> = {
  A: "Ala", R: "Arg", N: "Asn", D: "Asp", C: "Cys", Q: "Gln", E: "Glu", G: "Gly",
  H: "His", I: "Ile", L: "Leu", K: "Lys", M: "Met", F: "Phe", P: "Pro", S: "Ser",
  T: "Thr", W: "Trp", Y: "Tyr", V: "Val", "*": "End",
};

// Emits a DNAWorks custom codon-frequency block (GCG-style, 5 columns per line:
// AA3 codon count perThousand fraction). DNAWorks reads columns 1, 2 and 5, uses
// the fraction (0-1) for codon selection, and requires all 64 codons to be
// present with a non-zero frequency, so absent/zero entries are floored.
function buildCodonBlock(table: CodonTable): string {
  const lines = ["CODON"];
  for (const [codon, aa1] of Object.entries(GENETIC_CODE)) {
    const aa3 = AA1_TO_AA3[aa1];
    if (!aa3) continue;
    const raw = table[aa1]?.[codon] ?? 0;
    const fraction = Math.max(raw, 0.001);
    const count = Math.max(1, Math.round(fraction * 1000));
    lines.push(`${aa3}\t${codon}\t${count}\t0.00\t${fraction.toFixed(3)}`);
  }
  lines.push("//");
  return lines.join("\n");
}

// Feeds DNAWorks the PROTEIN sequence plus the host codon table, letting it pick
// synonymous codons itself. Unlike a fixed NUCLEOTIDE input this preserves codon
// degeneracy, so DNAWorks can break up repeats and resolve misprimes.
function buildProteinInputTemplate(protein: string, table: CodonTable): string {
  const residues = protein.toUpperCase().replace(/[^ACDEFGHIKLMNPQRSTVWY*]/g, "").replace(/\*/g, "X");
  return [
    'title "CODON_TOOLS_DNAWORKS"',
    'logfile "LOGFILE.txt"',
    "timelimit 30",
    "solutions 1",
    // Lower than DNAWorks' 50% default so more synonymous codons stay active,
    // giving it the degeneracy it needs to break up repeats and avoid misprimes.
    "frequency threshold 10",
    buildCodonBlock(table),
    "PROTEIN",
    wrapSequence(residues),
    "//",
    "",
  ].join("\n");
}

async function runPureJS(sequence: string, params: OptimizeParams): Promise<OptimizeResult> {
  const clean = sequence.toUpperCase().replace(/\s/g, "");
  const isProtein = /^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(clean);
  const isDna = /^[ATCGN]+$/.test(clean);
  if (!isProtein && !isDna) {
    throw new Error("序列格式无效，必须是 DNA 或蛋白序列");
  }

  const effectiveParams = isDna ? { ...params, sourceDnaSequence: clean } : params;
  const result = optimizeSequenceAuto(clean, effectiveParams);

  const polished = polishRepeats(result.optimizedSequence, effectiveParams);
  let finalSequence = polished.sequence;
  const retainWarnings: string[] = [];
  let protectedCodonIndexes: number[] = [];

  if (isDna && effectiveParams.retainEnzymes?.length) {
    const retainConstraint = buildRetainConstraint(clean, effectiveParams.retainEnzymes);
    protectedCodonIndexes = retainConstraint.protectedCodonIndexes;
    finalSequence = restoreProtectedCodons(clean, finalSequence, protectedCodonIndexes);
    for (const site of retainConstraint.missingSites) {
      retainWarnings.push(`警告: 原始DNA序列中未找到需要保留的酶切位点 ${site}，已忽略该约束`);
    }
    for (const site of retainConstraint.normalizedSites) {
      const expectedCount = retainConstraint.expectedSiteCounts[site] ?? 0;
      if (expectedCount === 0) continue;
      const actualCount = countRestrictionSiteOccurrences(finalSequence, site);
      if (actualCount < expectedCount) {
        retainWarnings.push(`警告: 需要保留的酶切位点 ${site} 未被完整保留（原始 ${expectedCount} 处，当前 ${actualCount} 处）`);
      }
    }
  } else if (isProtein && effectiveParams.retainEnzymes?.length) {
    retainWarnings.push("警告: 蛋白序列输入无法识别原始DNA中的酶切位点，已忽略'需要保留的酶切位点'约束");
  }

  let optimizedMetrics = scoreDnaSequence(finalSequence, params.hostSpecies, params.codonTable);
  const caiWarnings: string[] = [];
  if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI) {
    const lifted = raiseCaiAboveThreshold(finalSequence, {
      hostSpecies: params.hostSpecies,
      codonTable: params.codonTable,
      avoidEnzymes: params.avoidEnzymes,
      targetGcMin: params.targetGcMin,
      targetGcMax: params.targetGcMax,
      protectedCodonIndexes,
    });
    const liftedMetrics = scoreDnaSequence(lifted, params.hostSpecies, params.codonTable);
    if (liftedMetrics.cai > optimizedMetrics.cai) {
      caiWarnings.push(`CAI 自动拉升：${optimizedMetrics.cai.toFixed(3)} -> ${liftedMetrics.cai.toFixed(3)}`);
      finalSequence = lifted;
      optimizedMetrics = liftedMetrics;
    }
    if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI) {
      caiWarnings.push(`警告: 自动拉升后 CAI ${optimizedMetrics.cai.toFixed(3)} 仍低于阈值 ${MIN_ACCEPTABLE_CAI}，受酶切位点/GC 约束限制`);
    }
  }

  const repeatStats = analyzeRepeatStats(finalSequence);
  const warnings = [
    ...result.warnings,
    ...retainWarnings,
    ...caiWarnings,
    ...(polished.note ? [polished.note] : []),
    ...(params.eliminateRepeats !== false && repeatStats.total > 0
      ? [`检测到 ${repeatStats.total} 个重复序列区域（DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}）`]
      : []),
    "[纯 JavaScript 模式] DNAWorks 引擎不可用，使用内置算法优化",
  ];

  return {
    optimizedSequence: finalSequence,
    cai: optimizedMetrics.cai,
    gcContent: optimizedMetrics.gcContent,
    changes: countCodonChanges(isProtein ? result.optimizedSequence : clean, finalSequence),
    warnings,
    repeatStats,
  };
}

async function runDNAWorks(sequence: string, params: OptimizeParams): Promise<OptimizeResult> {
  const executable = ENV.dnaWorksExecutablePath;
  if (!executable || !existsSync(executable)) {
    throw new Error("DNAWorks 未配置，请设置 DNAWORKS_EXECUTABLE_PATH 指向 dnaworks 可执行文件");
  }

  const runDir = path.join(ENV.dnaWorksWorkdir || os.tmpdir(), `dnaworks-${randomUUID()}`);
  await fs.mkdir(runDir, { recursive: true });

  try {
    const clean = sequence.toUpperCase().replace(/\s/g, "");
    const isProtein = /^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(clean);
    const isDna = /^[ATCGN]+$/.test(clean);
    if (!isProtein && !isDna) {
      throw new Error("序列格式无效，必须是 DNA 或蛋白序列");
    }

    const effectiveParams = isDna ? { ...params, sourceDnaSequence: clean } : params;
    const proteinResidueCount = clean.replace(/\*/g, "").length;
    const expectedMinLength = isProtein ? proteinResidueCount * 3 : 0;
    const expectedDnaLength = isProtein ? proteinResidueCount * 3 : clean.length;
    if (expectedDnaLength < 50) {
      throw new Error("DNAWorks 要求 DNA 序列长度至少为 50 nt，当前序列过短");
    }

    const inputPath = path.join(runDir, "DNAWORKS.inp");
    const logfilePath = path.join(runDir, "LOGFILE.txt");
    // Protein input feeds DNAWorks a PROTEIN block + host codon table so it keeps
    // codon degeneracy; DNA input stays a fixed NUCLEOTIDE block.
    const inputContent = isProtein
      ? buildProteinInputTemplate(clean, resolveCodonTable(params.hostSpecies, params.codonTable))
      : buildInputTemplate(clean);
    await fs.writeFile(inputPath, inputContent, "utf8");

    const { stdout, stderr } = await runExecFile(executable, ["DNAWORKS.inp"], runDir);
    const logContent = existsSync(logfilePath) ? await fs.readFile(logfilePath, "utf8") : "";
    const fort10Path = path.join(runDir, "fort.10");
    const fort10Content = existsSync(fort10Path) ? await fs.readFile(fort10Path, "utf8") : "";
    const optimized = extractOptimizedDna(logContent);

    if (!optimized) {
      const errorText = [stdout, stderr, fort10Content, logContent].filter(Boolean).join("\n");
      if (errorText.includes("DNA length is less than 50 nt")) {
        throw new Error("DNAWorks 要求 DNA 序列长度至少为 50 nt，当前序列过短");
      }
      if (errorText.includes("Too many misprimes")) {
        throw new Error(
          isProtein
            ? "DNAWorks 在该序列上检测到过多 misprimes（交叉错配），即便放开密码子选择仍无法生成可组装方案。该蛋白重复模块过多，建议拆分片段或人工调整后再试。"
            : "DNAWorks 在该序列上检测到过多 misprimes（交叉错配），未能生成可解折方案。该序列重复模块较多，当前固定 DNA 输入会使 DNAWorks 无法继续优化，建议改用蛋白序列输入以放开密码子选择。"
        );
      }
      throw new Error("DNAWorks 未生成可解析的优化序列，请检查输入序列与 DNAWorks 输出");
    }

    if (expectedMinLength && optimized.length < expectedMinLength) {
      throw new Error(`DNAWorks 输出长度异常：期望至少 ${expectedMinLength} nt，实际 ${optimized.length} nt`);
    }

    const polished = polishRepeats(optimized, effectiveParams);
    let finalSequence = polished.sequence;
    const retainWarnings: string[] = [];
    let protectedCodonIndexes: number[] = [];

    if (isDna && effectiveParams.retainEnzymes?.length) {
      const retainConstraint = buildRetainConstraint(clean, effectiveParams.retainEnzymes);
      protectedCodonIndexes = retainConstraint.protectedCodonIndexes;
      finalSequence = restoreProtectedCodons(clean, finalSequence, protectedCodonIndexes);
      for (const site of retainConstraint.missingSites) {
        retainWarnings.push(`警告: 原始DNA序列中未找到需要保留的酶切位点 ${site}，已忽略该约束`);
      }
      for (const site of retainConstraint.normalizedSites) {
        const expectedCount = retainConstraint.expectedSiteCounts[site] ?? 0;
        if (expectedCount === 0) continue;
        const actualCount = countRestrictionSiteOccurrences(finalSequence, site);
        if (actualCount < expectedCount) {
          retainWarnings.push(`警告: 需要保留的酶切位点 ${site} 未被完整保留（原始 ${expectedCount} 处，当前 ${actualCount} 处）`);
        }
      }
    } else if (isProtein && effectiveParams.retainEnzymes?.length) {
      retainWarnings.push("警告: 蛋白序列输入无法识别原始DNA中的酶切位点，已忽略'需要保留的酶切位点'约束");
    }

    let optimizedMetrics = scoreDnaSequence(finalSequence, params.hostSpecies, params.codonTable);
    const caiWarnings: string[] = [];
    if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI) {
      const lifted = raiseCaiAboveThreshold(finalSequence, {
        hostSpecies: params.hostSpecies,
        codonTable: params.codonTable,
        avoidEnzymes: params.avoidEnzymes,
        targetGcMin: params.targetGcMin,
        targetGcMax: params.targetGcMax,
        protectedCodonIndexes,
      });
      const liftedMetrics = scoreDnaSequence(lifted, params.hostSpecies, params.codonTable);
      if (liftedMetrics.cai > optimizedMetrics.cai) {
        caiWarnings.push(`CAI 自动拉升：${optimizedMetrics.cai.toFixed(3)} -> ${liftedMetrics.cai.toFixed(3)}`);
        finalSequence = lifted;
        optimizedMetrics = liftedMetrics;
      }
      if (optimizedMetrics.cai < MIN_ACCEPTABLE_CAI) {
        caiWarnings.push(`警告: 自动拉升后 CAI ${optimizedMetrics.cai.toFixed(3)} 仍低于阈值 ${MIN_ACCEPTABLE_CAI}，受酶切位点/GC 约束限制`);
      }
    }
    const repeatStats = analyzeRepeatStats(finalSequence);
    const warnings = [
      ...optimizedMetrics.warnings,
      ...retainWarnings,
      ...caiWarnings,
      ...(polished.note ? [polished.note] : []),
      ...(params.eliminateRepeats !== false && repeatStats.total > 0
        ? [`检测到 ${repeatStats.total} 个重复序列区域（DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}）`]
        : []),
      ...(stderr.trim() ? [stderr.trim()] : []),
    ];

    return {
      optimizedSequence: finalSequence,
      cai: optimizedMetrics.cai,
      gcContent: optimizedMetrics.gcContent,
      changes: countCodonChanges(isProtein ? optimized : clean, finalSequence),
      warnings,
      repeatStats,
    };
  } finally {
    await fs.rm(runDir, { recursive: true, force: true });
  }
}

export async function optimizeByStrategy(
  sequence: string,
  params: OptimizeParams,
  strategy: OptimizationStrategy = "dnaworks"
): Promise<OptimizeResult> {
  if (strategy === "js") {
    return runPureJS(sequence, params);
  }

  // Try DNAWorks first, fallback to pure JS if it fails
  try {
    return await runDNAWorks(sequence, params);
  } catch (dnaWorksError) {
    const errorMsg = dnaWorksError instanceof Error ? dnaWorksError.message : String(dnaWorksError);
    // If DNAWorks binary is missing or fails to execute, fallback to JS
    if (
      errorMsg.includes("DNAWorks 未配置") ||
      errorMsg.includes("ENOENT") ||
      errorMsg.includes("Command failed") ||
      errorMsg.includes("Exit code")
    ) {
      const jsResult = await runPureJS(sequence, params);
      jsResult.warnings.push(`[DNAWorks 回退] 外部引擎调用失败：${errorMsg.split("\n")[0]}`);
      return jsResult;
    }
    throw dnaWorksError;
  }
}
