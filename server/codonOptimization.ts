/**
 * Codon Optimization Module
 * Implements codon optimization algorithms inspired by DNAWorks
 */

import { CODON_TABLES, HOST_TO_TABLE } from "./codonTables";

// Standard genetic code

// Standard genetic code
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

const MIN_ACCEPTABLE_CAI = 0.8;
const RAMP_WINDOW_CODONS = 40;
const LOW_FREQUENCY_THRESHOLD = 0.12;
const MIN_REPEAT_LENGTH = 9;
const DNA_COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
  N: "N",
};

export type CodonTable = Record<string, Record<string, number>>;
export type RepeatType = "DR" | "IR" | "PR";

export interface RepeatPair {
  type: RepeatType;
  position1: number;
  position2: number;
  length: number;
  sequence1: string;
  sequence2: string;
}

export interface RepeatStats {
  minLength: number;
  total: number;
  direct: number;
  inverted: number;
  palindromic: number;
  maxLength: number;
  pairs: RepeatPair[];
}

interface OptimizationParams {
  hostSpecies: string;
  codonTable?: CodonTable;
  avoidEnzymes?: string[];
  retainEnzymes?: string[];
  sourceDnaSequence?: string;
  targetGcMin?: number;
  targetGcMax?: number;
  eliminateRepeats?: boolean;
}

interface OptimizationResult {
  optimizedSequence: string;
  cai: number;
  gcContent: number;
  changes: number;
  warnings: string[];
  repeatStats: RepeatStats;
}

const REQUIRED_AMINO_ACIDS = ["A", "R", "N", "D", "C", "Q", "E", "G", "H", "I", "L", "K", "M", "F", "P", "S", "T", "W", "Y", "V", "*"] as const;

function toCodonTableObject(input: unknown): Record<string, unknown> {
  if (!input) {
    throw new Error("密码子表格式无效：必须是 JSON 对象");
  }
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (!Array.isArray(input)) {
    throw new Error("密码子表格式无效：必须是 JSON 对象");
  }
  const out: Record<string, Record<string, number>> = {};
  for (const item of input) {
    if (Array.isArray(item) && item.length === 2 && typeof item[0] === "string" && item[1] && typeof item[1] === "object") {
      out[item[0].toUpperCase()] = item[1] as Record<string, number>;
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const aaRaw = row.aa ?? row.aminoAcid ?? row.amino_acid;
    if (typeof aaRaw !== "string") continue;
    const aa = aaRaw.toUpperCase();
    if (row.codons && typeof row.codons === "object" && !Array.isArray(row.codons)) {
      out[aa] = row.codons as Record<string, number>;
      continue;
    }
    const codonRaw = row.codon;
    const freqRaw = row.frequency ?? row.freq ?? row.weight ?? row.value;
    if (typeof codonRaw === "string" && freqRaw !== undefined) {
      if (!out[aa]) out[aa] = {};
      out[aa][codonRaw.toUpperCase()] = typeof freqRaw === "number" ? freqRaw : Number(freqRaw);
    }
  }
  if (Object.keys(out).length === 0) {
    throw new Error("密码子表格式无效：数组内容无法转换为 codon table");
  }
  return out;
}

function normalizeCodonTable(input: unknown): CodonTable {
  const obj = toCodonTableObject(input);
  const normalized: CodonTable = {};
  for (const aa of REQUIRED_AMINO_ACIDS) {
    const row = obj[aa];
    if (!row || typeof row !== "object" || Array.isArray(row)) {
      throw new Error(`密码子表缺少氨基酸 ${aa} 的定义`);
    }
    const rowObj = row as Record<string, unknown>;
    const entries = Object.entries(rowObj);
    if (entries.length === 0) {
      throw new Error(`密码子表中氨基酸 ${aa} 没有可用密码子`);
    }
    let sum = 0;
    const normalizedRow: Record<string, number> = {};
    for (const [codonRaw, freqRaw] of entries) {
      const codon = codonRaw.toUpperCase();
      if (!/^[ATCG]{3}$/.test(codon)) {
        throw new Error(`非法密码子：${codonRaw}`);
      }
      const mappedAa = GENETIC_CODE[codon];
      if (!mappedAa || mappedAa !== aa) {
        throw new Error(`密码子 ${codon} 不属于氨基酸 ${aa}`);
      }
      const freq = typeof freqRaw === "number" ? freqRaw : Number(freqRaw);
      if (!Number.isFinite(freq) || freq < 0) {
        throw new Error(`密码子 ${codon} 的频率无效`);
      }
      normalizedRow[codon] = freq;
      sum += freq;
    }
    if (sum <= 0) {
      throw new Error(`氨基酸 ${aa} 的频率总和必须大于 0`);
    }
    for (const codon of Object.keys(normalizedRow)) {
      normalizedRow[codon] = normalizedRow[codon] / sum;
    }
    normalized[aa] = normalizedRow;
  }
  return normalized;
}

export function resolveCodonTable(hostSpecies: string, codonTable?: CodonTable): CodonTable {
  if (codonTable) return normalizeCodonTable(codonTable);
  const builtIn = CODON_TABLES[hostSpecies] ?? CODON_TABLES[HOST_TO_TABLE[hostSpecies]];
  if (!builtIn) {
    throw new Error(`宿主 ${hostSpecies} 缺少密码子偏好表，请先在宿主管理中维护 codon table`);
  }
  return builtIn;
}

export function validateAndNormalizeCodonTable(input: unknown): CodonTable {
  return normalizeCodonTable(input);
}

/**
 * Translate DNA sequence to protein
 */
function translateDNA(dna: string): string {
  const cleanDNA = dna.toUpperCase().replace(/\s/g, "");
  let protein = "";
  
  for (let i = 0; i < cleanDNA.length - 2; i += 3) {
    const codon = cleanDNA.substring(i, i + 3);
    protein += GENETIC_CODE[codon] || "X";
  }
  
  return protein;
}

/**
 * Calculate GC content percentage
 */
function calculateGC(sequence: string): number {
  const gc = (sequence.match(/[GC]/gi) || []).length;
  return (gc / sequence.length) * 100;
}

/**
 * Calculate Codon Adaptation Index (CAI)
 */
function calculateCAI(sequence: string, codonTable: Record<string, Record<string, number>>): number {
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
  
  // CAI is geometric mean of codon weights
  const cai = Math.exp(totalWeight / codonCount);
  return Math.min(1, cai); // Cap at 1.0
}

/**
 * Check if sequence contains restriction enzyme site
 */
function containsEnzymeSite(sequence: string, enzymeSite: string): boolean {
  return sequence.toUpperCase().includes(enzymeSite.toUpperCase());
}

export function normalizeRestrictionSites(sites: string[] = []): string[] {
  return Array.from(
    new Set(
      sites
        .map((site) => site.toUpperCase().replace(/\s/g, "").trim())
        .filter(Boolean)
    )
  );
}

export function countRestrictionSiteOccurrences(sequence: string, enzymeSite: string): number {
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

export type RetainConstraint = {
  normalizedSites: string[];
  protectedCodonIndexes: number[];
  missingSites: string[];
  expectedSiteCounts: Record<string, number>;
};

export function buildRetainConstraint(sourceDnaSequence: string, retainEnzymes: string[] = []): RetainConstraint {
  const cleanSource = sourceDnaSequence.toUpperCase().replace(/\s/g, "");
  const normalizedSites = normalizeRestrictionSites(retainEnzymes);
  const protectedCodonIndexes = new Set<number>();
  const expectedSiteCounts: Record<string, number> = {};
  const missingSites: string[] = [];

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
    expectedSiteCounts,
  };
}

export function restoreProtectedCodons(
  sourceDnaSequence: string,
  candidateSequence: string,
  protectedCodonIndexes: number[]
): string {
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

/**
 * Build reverse complement sequence
 */
function reverseComplement(sequence: string): string {
  return sequence
    .toUpperCase()
    .split("")
    .reverse()
    .map((nt) => DNA_COMPLEMENT[nt] ?? "N")
    .join("");
}

function complement(nt: string): string {
  return DNA_COMPLEMENT[nt.toUpperCase()] ?? "N";
}

/**
 * Analyze repeat sequences using the original DNAWorks concepts:
 * direct repeats (DR), inverted repeats (IR), and palindromic repeats (PR),
 * with the default minimum repeat length of 9 nt.
 */
export function analyzeRepeatStats(sequence: string, minLength = MIN_REPEAT_LENGTH): RepeatStats {
  const seq = sequence.toUpperCase();
  const pairs: RepeatPair[] = [];
  const seen = new Set<string>();

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
        sequence2: seq.slice(j, j + length),
      });
    }
  }

  for (let i = 0; i <= seq.length - minLength; i++) {
    for (let end2 = i + minLength - 1; end2 < seq.length; end2++) {
      let length = 0;
      while (
        i + length < seq.length &&
        end2 - length >= 0 &&
        seq[i + length] === complement(seq[end2 - length])
      ) {
        length += 1;
      }

      if (length < minLength) continue;

      const start2 = end2 - length + 1;
      if (start2 < i) continue;
      if (i > 0 && end2 + 1 < seq.length && seq[i - 1] === complement(seq[end2 + 1])) continue;

      const type: RepeatType = start2 === i ? "PR" : "IR";
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
        sequence2: reverseComplement(sequence2),
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
    pairs,
  };
}

function getCodonWeight(
  aa: string,
  codon: string,
  codonTable: Record<string, Record<string, number>>
): number {
  if (!codonTable[aa]) return 0;
  return codonTable[aa][codon] || 0;
}

function codonMatchesAminoAcid(codon: string, aa: string): boolean {
  return GENETIC_CODE[codon.toUpperCase()] === aa;
}

function canUseCodon(
  codon: string,
  currentSequence: string,
  avoidSites: string[],
  targetGC?: { min: number; max: number }
): boolean {
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

function getConsecutiveRareCodons(
  currentSequence: string,
  codonTable: Record<string, Record<string, number>>
): number {
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

function localGcAt5Prime(testSeq: string): number {
  const window = testSeq.slice(0, Math.min(90, testSeq.length));
  return calculateGC(window);
}

/**
 * Select optimal codon for an amino acid
 */
function selectCodon(
  aa: string,
  codonTable: Record<string, Record<string, number>>,
  avoidSites: string[] = [],
  currentSequence: string = "",
  targetGC?: { min: number; max: number },
  codonIndex: number = 0
): string {
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

function enforceMinimumCAI(
  optimizedSequence: string,
  protein: string,
  codonTable: Record<string, Record<string, number>>,
  avoidSites: string[] = [],
  targetGC?: { min: number; max: number },
  protectedCodonIndexes: Set<number> = new Set()
): string {
  let best = optimizedSequence.toUpperCase();
  let bestCai = calculateCAI(best, codonTable);
  if (bestCai >= MIN_ACCEPTABLE_CAI) return best;
  const positions = Array.from({ length: protein.length }, (_, i) => i)
    .filter(i => protein[i] !== "*" && !!codonTable[protein[i]] && !protectedCodonIndexes.has(i))
    .sort((a, b) => {
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
      if (!avoidSites.every(site => !containsEnzymeSite(replaced, site))) continue;
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

/**
 * Try to raise the CAI of an already-optimized DNA sequence to the minimum
 * acceptable threshold by swapping in higher-frequency synonymous codons.
 * Protected codons are never touched, and avoid-enzyme / GC constraints are
 * respected. Returns the (possibly unchanged) sequence — it never lowers CAI.
 */
export function raiseCaiAboveThreshold(
  dnaSequence: string,
  params: {
    hostSpecies: string;
    codonTable?: CodonTable;
    avoidEnzymes?: string[];
    targetGcMin?: number;
    targetGcMax?: number;
    protectedCodonIndexes?: number[];
  }
): string {
  const codonTable = resolveCodonTable(params.hostSpecies, params.codonTable);
  const clean = dnaSequence.toUpperCase().replace(/\s/g, "");
  const protein = translateDNA(clean);
  const targetGC =
    params.targetGcMin !== undefined && params.targetGcMax !== undefined
      ? { min: params.targetGcMin, max: params.targetGcMax }
      : undefined;
  const protectedCodonIndexes = new Set(params.protectedCodonIndexes ?? []);
  return enforceMinimumCAI(clean, protein, codonTable, params.avoidEnzymes ?? [], targetGC, protectedCodonIndexes);
}

/**
 * Optimize DNA sequence for expression in a specific host
 */
export function optimizeSequence(
  dnaSequence: string,
  params: OptimizationParams
): OptimizationResult {
  const { hostSpecies, avoidEnzymes = [], retainEnzymes = [], targetGcMin, targetGcMax, eliminateRepeats = true } = params;
  
  const codonTable = resolveCodonTable(hostSpecies, params.codonTable);
  const sourceDnaSequence = (params.sourceDnaSequence ?? dnaSequence).toUpperCase().replace(/\s/g, "");
  const retainConstraint = buildRetainConstraint(sourceDnaSequence, retainEnzymes);
  const protectedCodonIndexes = new Set(retainConstraint.protectedCodonIndexes);
  
  // Translate original sequence
  const protein = translateDNA(dnaSequence);
  
  // Build optimized sequence
  let optimized = "";
  const warnings: string[] = [];
  let changes = 0;
  
  const targetGC = (targetGcMin !== undefined && targetGcMax !== undefined)
    ? { min: targetGcMin, max: targetGcMax }
    : undefined;
  
  for (let i = 0; i < protein.length; i++) {
    const aa = protein[i];
    const sourceCodon = sourceDnaSequence.substring(i * 3, i * 3 + 3).toUpperCase();
    
    if (aa === "*") {
      if (protectedCodonIndexes.has(i) && sourceCodon.length === 3 && codonMatchesAminoAcid(sourceCodon, aa)) {
        optimized += sourceCodon;
      } else {
        optimized += "TAA"; // Most common stop codon
      }
      continue;
    }
    
    const originalCodon = dnaSequence.substring(i * 3, i * 3 + 3).toUpperCase();
    const newCodon =
      protectedCodonIndexes.has(i) && sourceCodon.length === 3 && codonMatchesAminoAcid(sourceCodon, aa)
        ? sourceCodon
        : selectCodon(aa, codonTable, avoidEnzymes, optimized, targetGC, i);
    
    if (newCodon !== originalCodon) {
      changes++;
    }
    
    optimized += newCodon;
  }
  
  // Check for enzyme sites
  for (const enzyme of avoidEnzymes) {
    if (containsEnzymeSite(optimized, enzyme)) {
      warnings.push(`警告: 优化后的序列仍包含限制性酶切位点 ${enzyme}`);
    }
  }

  for (const site of retainConstraint.missingSites) {
    warnings.push(`警告: 原始DNA序列中未找到需要保留的酶切位点 ${site}，已忽略该约束`);
  }
  
  optimized = enforceMinimumCAI(optimized, protein, codonTable, avoidEnzymes, targetGC, protectedCodonIndexes);
  optimized = restoreProtectedCodons(sourceDnaSequence, optimized, retainConstraint.protectedCodonIndexes);

  for (const site of retainConstraint.normalizedSites) {
    const expectedCount = retainConstraint.expectedSiteCounts[site] ?? 0;
    if (expectedCount === 0) continue;
    const actualCount = countRestrictionSiteOccurrences(optimized, site);
    if (actualCount < expectedCount) {
      warnings.push(`警告: 需要保留的酶切位点 ${site} 未被完整保留（原始 ${expectedCount} 处，当前 ${actualCount} 处）`);
    }
  }

  const cai = calculateCAI(optimized, codonTable);
  const gcContent = calculateGC(optimized);
  const repeatStats = analyzeRepeatStats(optimized);
  if (eliminateRepeats && repeatStats.total > 0) {
    warnings.push(
      `检测到 ${repeatStats.total} 个重复序列区域（DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}）`
    );
  }
  if (cai < MIN_ACCEPTABLE_CAI) {
    throw new Error(`优化后 CAI ${cai.toFixed(3)} 低于阈值 ${MIN_ACCEPTABLE_CAI}`);
  }
  
  // Check GC content
  if (targetGcMin !== undefined && gcContent < targetGcMin) {
    warnings.push(`GC含量 (${gcContent.toFixed(1)}%) 低于目标最小值 (${targetGcMin}%)`);
  }
  if (targetGcMax !== undefined && gcContent > targetGcMax) {
    warnings.push(`GC含量 (${gcContent.toFixed(1)}%) 高于目标最大值 (${targetGcMax}%)`);
  }
  
  return {
    optimizedSequence: optimized,
    cai: Math.round(cai * 1000) / 1000,
    gcContent: Math.round(gcContent * 10) / 10,
    changes,
    warnings,
    repeatStats,
  };
}

/**
 * Optimize protein (amino acid) sequence: reverse-translate to DNA using optimal codons
 */
export function optimizeProteinSequence(
  proteinSequence: string,
  params: OptimizationParams
): OptimizationResult {
  const { hostSpecies, avoidEnzymes = [], retainEnzymes = [], targetGcMin, targetGcMax, eliminateRepeats = true } = params;

  const codonTable = resolveCodonTable(hostSpecies, params.codonTable);

  const protein = proteinSequence.toUpperCase().replace(/\s/g, "");
  if (!/^[ACDEFGHIKLMNPQRSTVWY*]+$/.test(protein)) {
    throw new Error("Invalid amino acid sequence: use single-letter codes (ACDEFGHIKLMNPQRSTVWY*)");
  }

  let optimized = "";
  const warnings: string[] = [];

  if (retainEnzymes.length > 0) {
    warnings.push("警告: 蛋白序列输入无法识别原始DNA中的酶切位点，已忽略“需要保留的酶切位点”约束");
  }

  const targetGC = (targetGcMin !== undefined && targetGcMax !== undefined)
    ? { min: targetGcMin, max: targetGcMax }
    : undefined;

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
      warnings.push(`警告: 优化后的序列仍包含限制性酶切位点 ${enzyme}`);
    }
  }

  optimized = enforceMinimumCAI(optimized, protein, codonTable, avoidEnzymes, targetGC);
  const cai = calculateCAI(optimized, codonTable);
  const gcContent = calculateGC(optimized);
  const repeatStats = analyzeRepeatStats(optimized);
  if (eliminateRepeats && repeatStats.total > 0) {
    warnings.push(
      `检测到 ${repeatStats.total} 个重复序列区域（DR ${repeatStats.direct} / IR ${repeatStats.inverted} / PR ${repeatStats.palindromic}）`
    );
  }
  if (cai < MIN_ACCEPTABLE_CAI) {
    throw new Error(`优化后 CAI ${cai.toFixed(3)} 低于阈值 ${MIN_ACCEPTABLE_CAI}`);
  }

  if (targetGcMin !== undefined && gcContent < targetGcMin) {
    warnings.push(`GC含量 (${gcContent.toFixed(1)}%) 低于目标最小值 (${targetGcMin}%)`);
  }
  if (targetGcMax !== undefined && gcContent > targetGcMax) {
    warnings.push(`GC含量 (${gcContent.toFixed(1)}%) 高于目标最大值 (${targetGcMax}%)`);
  }

  return {
    optimizedSequence: optimized,
    cai: Math.round(cai * 1000) / 1000,
    gcContent: Math.round(gcContent * 10) / 10,
    changes: protein.length, // 全部为新选择
    warnings,
    repeatStats,
  };
}

/**
 * Optimize sequence (accepts DNA or protein, auto-detects)
 */
export function optimizeSequenceAuto(
  sequence: string,
  params: OptimizationParams
): OptimizationResult {
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

/**
 * Get available host species
 */
export function getAvailableHosts(): string[] {
  return Object.keys(HOST_TO_TABLE);
}

export function scoreDnaSequence(
  dnaSequence: string,
  hostSpecies: string,
  codonTable?: CodonTable
): { cai: number; gcContent: number; warnings: string[] } {
  const cleanSeq = dnaSequence.toUpperCase().replace(/\s/g, "");
  const table = resolveCodonTable(hostSpecies, codonTable);
  const cai = calculateCAI(cleanSeq, table);
  const gcContent = calculateGC(cleanSeq);
  return {
    cai: Math.round(cai * 1000) / 1000,
    gcContent: Math.round(gcContent * 10) / 10,
    warnings: [],
  };
}

/**
 * Analyze codon usage in a sequence
 */
export function analyzeCodonUsage(dnaSequence: string): Record<string, Record<string, number>> {
  const cleanSeq = dnaSequence.toUpperCase().replace(/\s/g, "");
  const usage: Record<string, Record<string, number>> = {};
  
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
  
  // Convert counts to frequencies
  for (const aa in usage) {
    const total = Object.values(usage[aa]).reduce((sum, count) => sum + count, 0);
    for (const codon in usage[aa]) {
      usage[aa][codon] = usage[aa][codon] / total;
    }
  }
  
  return usage;
}
