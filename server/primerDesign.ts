/**
 * Primer Design Module
 * Implements PCR and sequencing primer design algorithms
 */

interface PrimerParams {
  minLength?: number;
  maxLength?: number;
  minTm?: number;
  maxTm?: number;
  minGC?: number;
  maxGC?: number;
  naConc?: number;
  primerConc?: number;
  maxTmDiff?: number;
  maxSelfComplementarity?: number;
  minProductLength?: number;
  maxProductLength?: number;
  protectiveBasesLength?: number;
  sequencingOffset?: number;
  synthesisOligoLength?: number;
  synthesisMinOverlap?: number;
  synthesisMaxOverlap?: number;
  synthesisTargetOverlapTm?: number;
}

interface Primer {
  sequence: string;
  start: number;
  end: number;
  length: number;
  tm: number;
  gcContent: number;
  qualityScore?: number;
  components?: {
    protectiveBases?: string;
    restrictionSite?: string;
    annealingRegion: string;
  };
}

interface PrimerPair {
  forward: Primer;
  reverse: Primer;
  productLength: number;
}

export interface SynthesisOligo {
  index: number;
  start: number;
  end: number;
  length: number;
  strand: "forward" | "reverse";
  sequence: string;
  overlapWithNext?: number;
  overlapTm?: number;
  selfDimerScore?: number;
  hairpinScore?: number;
  qualityScore?: number;
}

export interface SynthesisDesignResult {
  oligos: SynthesisOligo[];
  globalScore: number;
  avgOverlapTmDelta: number;
  maxSelfDimer: number;
  maxHairpin: number;
}

const NN_PARAMS: Record<string, { dh: number; ds: number }> = {
  AA: { dh: -7.9, ds: -22.2 }, TT: { dh: -7.9, ds: -22.2 },
  AT: { dh: -7.2, ds: -20.4 }, TA: { dh: -7.2, ds: -21.3 },
  CA: { dh: -8.5, ds: -22.7 }, TG: { dh: -8.5, ds: -22.7 },
  GT: { dh: -8.4, ds: -22.4 }, AC: { dh: -8.4, ds: -22.4 },
  CT: { dh: -7.8, ds: -21.0 }, AG: { dh: -7.8, ds: -21.0 },
  GA: { dh: -8.2, ds: -22.2 }, TC: { dh: -8.2, ds: -22.2 },
  CG: { dh: -10.6, ds: -27.2 }, GC: { dh: -9.8, ds: -24.4 },
  GG: { dh: -8.0, ds: -19.9 }, CC: { dh: -8.0, ds: -19.9 },
};

const COMPLEMENT: Record<string, string> = {
  A: "T",
  T: "A",
  C: "G",
  G: "C",
  N: "N",
};

function normalizeDna(sequence: string): string {
  return sequence.toUpperCase().replace(/\s/g, "").replace(/U/g, "T");
}

export function calculateTm(sequence: string, naConc: number = 50, primerConc: number = 0.25): number {
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
  const tmKelvin = (deltaH * 1000) / (deltaS + R * Math.log(ct));
  const saltAdj = 16.6 * Math.log10(Math.max(naConc, 1) / 1000);
  const tm = tmKelvin - 273.15 + saltAdj;

  return Math.round(tm * 10) / 10;
}

export function calculateGCContent(sequence: string): number {
  const seq = normalizeDna(sequence);
  if (!seq.length) return 0;
  const gc = (seq.match(/[GC]/g) || []).length;
  return Math.round((gc / seq.length) * 1000) / 10;
}

export function reverseComplement(sequence: string): string {
  return normalizeDna(sequence)
    .split("")
    .reverse()
    .map((base) => COMPLEMENT[base] || base)
    .join("");
}

function maxConsecutiveMatches(a: string, b: string): number {
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

function checkPrimerQuality(sequence: string, maxSelfComplementarity = 7): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;
  const seq = normalizeDna(sequence);
  const rc = reverseComplement(seq);

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

type PrimerCandidate = Primer & { score: number; issues: string[] };

function enumerateForwardFailureStats(template: string, startMin: number, startMax: number, params: Required<PrimerParams>) {
  const seq = normalizeDna(template);
  const stats = {
    total: 0,
    invalidBase: 0,
    tmLow: 0,
    tmHigh: 0,
    gcLow: 0,
    gcHigh: 0,
    qualityLow: 0,
    pass: 0,
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

function enumerateReverseFailureStats(template: string, endMin: number, endMax: number, params: Required<PrimerParams>) {
  const seq = normalizeDna(template);
  const stats = {
    total: 0,
    invalidBase: 0,
    tmLow: 0,
    tmHigh: 0,
    gcLow: 0,
    gcHigh: 0,
    qualityLow: 0,
    pass: 0,
  };
  for (let end = endMin; end <= endMax; end++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (end - len < 0) continue;
      stats.total++;
      const templateRegion = seq.slice(end - len, end);
      const primerSeq = reverseComplement(templateRegion);
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

function summarizeStats(prefix: string, stats: ReturnType<typeof enumerateForwardFailureStats>) {
  const rows = [
    { label: "Tm偏低", n: stats.tmLow },
    { label: "Tm偏高", n: stats.tmHigh },
    { label: "GC偏低", n: stats.gcLow },
    { label: "GC偏高", n: stats.gcHigh },
    { label: "自互补/重复超限", n: stats.qualityLow },
    { label: "含非ATCG字符", n: stats.invalidBase },
  ].filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  if (!rows.length) return `${prefix}窗口内无可用候选`;
  return `${prefix}候选不足（${rows.map(x => `${x.label}${x.n}`).join("，")}）`;
}

function buildForwardCandidates(template: string, startMin: number, startMax: number, params: Required<PrimerParams>): PrimerCandidate[] {
  const list: PrimerCandidate[] = [];
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
        issues: quality.issues,
      });
    }
  }
  return list.sort((a, b) => b.score - a.score).slice(0, 60);
}

function buildReverseCandidates(template: string, endMin: number, endMax: number, params: Required<PrimerParams>): PrimerCandidate[] {
  const list: PrimerCandidate[] = [];
  const seq = normalizeDna(template);
  const targetTm = (params.minTm + params.maxTm) / 2;
  const targetGc = (params.minGC + params.maxGC) / 2;
  for (let end = endMin; end <= endMax; end++) {
    for (let len = params.minLength; len <= params.maxLength; len++) {
      if (end - len < 0) continue;
      const templateRegion = seq.slice(end - len, end);
      const primerSeq = reverseComplement(templateRegion);
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
        issues: quality.issues,
      });
    }
  }
  return list.sort((a, b) => b.score - a.score).slice(0, 60);
}

function toRequiredParams(params: PrimerParams = {}): Required<PrimerParams> {
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
    synthesisTargetOverlapTm: params.synthesisTargetOverlapTm ?? 60,
  };
}

export function designPCRPrimers(
  template: string,
  targetStart: number,
  targetEnd: number,
  params: PrimerParams = {}
): PrimerPair | null {
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

  let best: { forward: PrimerCandidate; reverse: PrimerCandidate; score: number; productLength: number } | null = null;
  for (const f of forwards) {
    for (const r of reverses) {
      if (r.start <= f.start) continue;
      const productLength = r.end - f.start;
      if (productLength < p.minProductLength || productLength > p.maxProductLength) continue;
      const tmDiff = Math.abs(f.tm - r.tm);
      if (tmDiff > p.maxTmDiff) continue;
      const cross = maxConsecutiveMatches(f.sequence, reverseComplement(r.sequence));
      const cross3 = maxConsecutiveMatches(f.sequence.slice(-8), reverseComplement(r.sequence).slice(0, 8));
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
    productLength: best.productLength,
  };
}

export function explainPCRDesignFailure(
  template: string,
  targetStart: number,
  targetEnd: number,
  params: PrimerParams = {}
): string {
  const seq = normalizeDna(template);
  if (!seq) return "模板序列为空";
  if (!/^[ATCGN]+$/.test(seq)) return "模板序列包含非法字符，仅支持ATCGN";
  const p = toRequiredParams(params);
  if (p.minLength > p.maxLength) return "最小长度大于最大长度";
  if (p.minTm > p.maxTm) return "最小Tm大于最大Tm";
  if (p.minGC > p.maxGC) return "最小GC大于最大GC";
  if (targetStart < 0 || targetEnd > seq.length || targetStart >= targetEnd) return "目标区间无效";

  const maxShift = 6;
  const forwardStartMin = Math.max(0, targetStart - maxShift);
  const forwardStartMax = Math.min(targetStart + maxShift, seq.length - p.minLength);
  const reverseEndMin = Math.max(p.minLength, targetEnd - maxShift);
  const reverseEndMax = Math.min(seq.length, targetEnd + maxShift);
  if (forwardStartMax < forwardStartMin || reverseEndMax < reverseEndMin) return "目标区域过短，无法生成满足长度约束的引物";

  const forwards = buildForwardCandidates(seq, forwardStartMin, forwardStartMax, p);
  const reverses = buildReverseCandidates(seq, reverseEndMin, reverseEndMax, p);
  if (!forwards.length || !reverses.length) {
    const fStats = enumerateForwardFailureStats(seq, forwardStartMin, forwardStartMax, p);
    const rStats = enumerateReverseFailureStats(seq, reverseEndMin, reverseEndMax, p);
    const parts: string[] = [];
    if (!forwards.length) parts.push(summarizeStats("正向", fStats));
    if (!reverses.length) parts.push(summarizeStats("反向", rStats));
    return parts.join("；");
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
      const cross = maxConsecutiveMatches(f.sequence, reverseComplement(r.sequence));
      const cross3 = maxConsecutiveMatches(f.sequence.slice(-8), reverseComplement(r.sequence).slice(0, 8));
      if (cross > p.maxSelfComplementarity || cross3 >= 4) {
        dimerFail++;
        continue;
      }
    }
  }

  const pairReasons = [
    { label: "引物对Tm差过大", n: tmDiffFail },
    { label: "产物长度不满足约束", n: productLenFail },
    { label: "引物对互补性过强", n: dimerFail },
  ].filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 2);
  if (pairReasons.length) return `候选存在但配对失败：${pairReasons.map(x => `${x.label}${x.n}`).join("，")}`;
  return "候选存在但未找到满足所有约束的引物对，请放宽参数";
}

function generateProtectiveBases(length: number): string {
  const base = "GCGCGTAT";
  return base.repeat(Math.ceil(length / base.length)).slice(0, length);
}

export function designCloningPrimers(
  template: string,
  targetStart: number,
  targetEnd: number,
  forwardEnzyme: { name: string; site: string },
  reverseEnzyme: { name: string; site: string },
  params: PrimerParams = {}
): PrimerPair | null {
  // First design basic PCR primers
  const basicPrimers = designPCRPrimers(template, targetStart, targetEnd, params);
  if (!basicPrimers) {
    return null;
  }

  const p = toRequiredParams(params);
  const protectiveBases = generateProtectiveBases(p.protectiveBasesLength);

  const forwardWithSite = protectiveBases + forwardEnzyme.site + basicPrimers.forward.sequence;
  const reverseWithSite = protectiveBases + reverseEnzyme.site + basicPrimers.reverse.sequence;

  const forwardPrimer: Primer = {
    sequence: forwardWithSite,
    start: basicPrimers.forward.start,
    end: basicPrimers.forward.end,
    length: forwardWithSite.length,
    tm: calculateTm(basicPrimers.forward.sequence, p.naConc, p.primerConc),
    gcContent: calculateGCContent(forwardWithSite),
    qualityScore: basicPrimers.forward.qualityScore,
    components: {
      protectiveBases: protectiveBases,
      restrictionSite: forwardEnzyme.site,
      annealingRegion: basicPrimers.forward.sequence,
    },
  };

  const reversePrimer: Primer = {
    sequence: reverseWithSite,
    start: basicPrimers.reverse.start,
    end: basicPrimers.reverse.end,
    length: reverseWithSite.length,
    tm: calculateTm(basicPrimers.reverse.sequence, p.naConc, p.primerConc),
    gcContent: calculateGCContent(reverseWithSite),
    qualityScore: basicPrimers.reverse.qualityScore,
    components: {
      protectiveBases: protectiveBases,
      restrictionSite: reverseEnzyme.site,
      annealingRegion: basicPrimers.reverse.sequence,
    },
  };

  return {
    forward: forwardPrimer,
    reverse: reversePrimer,
    productLength: basicPrimers.productLength,
  };
}

export function designSequencingPrimers(
  template: string,
  targetStart: number,
  targetEnd: number,
  params: PrimerParams = {}
): { forward: Primer | null; reverse: Primer | null } {
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

export function explainSequencingDesignFailure(
  template: string,
  targetStart: number,
  targetEnd: number,
  params: PrimerParams = {}
): string {
  const seq = normalizeDna(template);
  if (!seq) return "模板序列为空";
  if (!/^[ATCGN]+$/.test(seq)) return "模板序列包含非法字符，仅支持ATCGN";
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
    return "上下游窗口均无可用测序引物，请降低Tm/GC阈值或减小偏移距离";
  }
  if (!forwardCandidates.length) {
    return "上游窗口无可用测序引物，请降低Tm/GC阈值或减小偏移距离";
  }
  if (!reverseCandidates.length) {
    return "下游窗口无可用测序引物，请降低Tm/GC阈值或减小偏移距离";
  }
  return "测序引物候选未满足当前约束";
}

function approximateHairpinScore(sequence: string): number {
  const seq = normalizeDna(sequence);
  let best = 0;
  for (let stem = 4; stem <= 9; stem++) {
    for (let loop = 3; loop <= 8; loop++) {
      for (let i = 0; i + stem + loop + stem <= seq.length; i++) {
        const left = seq.slice(i, i + stem);
        const right = seq.slice(i + stem + loop, i + stem + loop + stem);
        const comp = maxConsecutiveMatches(left, reverseComplement(right));
        if (comp > best) best = comp;
      }
    }
  }
  return best;
}

function estimateOligoScores(raw: string): { selfDimer: number; hairpin: number; quality: number } {
  const seq = normalizeDna(raw);
  const selfDimer = maxConsecutiveMatches(seq, reverseComplement(seq));
  const hairpin = approximateHairpinScore(seq);
  const gc = calculateGCContent(seq);
  const gcPenalty = Math.abs(gc - 50) / 8;
  const quality = Math.max(0, 100 - selfDimer * 6 - hairpin * 7 - gcPenalty * 4);
  return { selfDimer, hairpin, quality: Math.round(quality * 10) / 10 };
}

function scoreSynthesisPlan(oligos: SynthesisOligo[], targetOverlapTm: number): SynthesisDesignResult {
  if (!oligos.length) {
    return { oligos, globalScore: 0, avgOverlapTmDelta: 999, maxSelfDimer: 99, maxHairpin: 99 };
  }
  const overlapDeltas = oligos
    .filter(o => o.overlapTm !== undefined)
    .map(o => Math.abs((o.overlapTm || 0) - targetOverlapTm));
  const avgOverlapTmDelta = overlapDeltas.length ? overlapDeltas.reduce((a, b) => a + b, 0) / overlapDeltas.length : 0;
  const lengths = oligos.map(o => o.length);
  const lenAvg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const lenVar = lengths.reduce((s, x) => s + Math.pow(x - lenAvg, 2), 0) / lengths.length;
  const lenStd = Math.sqrt(lenVar);
  const maxSelfDimer = Math.max(...oligos.map(o => o.selfDimerScore || 0));
  const maxHairpin = Math.max(...oligos.map(o => o.hairpinScore || 0));

  let crossPenalty = 0;
  for (let i = 0; i < oligos.length - 1; i++) {
    const a = normalizeDna(oligos[i].sequence);
    const b = normalizeDna(oligos[i + 1].sequence);
    crossPenalty += maxConsecutiveMatches(a.slice(-12), reverseComplement(b).slice(0, 12));
  }

  const globalScoreRaw =
    100
    - avgOverlapTmDelta * 3.2
    - lenStd * 1.8
    - maxSelfDimer * 5.5
    - maxHairpin * 6.5
    - crossPenalty * 1.4;
  const globalScore = Math.round(Math.max(0, globalScoreRaw) * 10) / 10;
  return {
    oligos,
    globalScore,
    avgOverlapTmDelta: Math.round(avgOverlapTmDelta * 10) / 10,
    maxSelfDimer,
    maxHairpin,
  };
}

function buildSynthesisPlan(seq: string, targetLen: number, minOverlap: number, maxOverlap: number, targetOverlapTm: number, naConc: number, primerConc: number, startShift = 0): SynthesisOligo[] | null {
  const minTailLen = Math.max(28, targetLen - 12);
  const oligos: SynthesisOligo[] = [];
  let start = Math.max(0, startShift);
  let guard = 0;

  while (start < seq.length && guard < 500) {
    guard++;
    let end = Math.min(seq.length, start + targetLen);
    const remain = seq.length - end;
    if (remain > 0 && remain < minTailLen) {
      end = Math.max(start + 30, seq.length - minTailLen);
    }

    const raw = seq.slice(start, end);
    const score = estimateOligoScores(raw);
    const index = oligos.length + 1;
    const strand: "forward" | "reverse" = index % 2 === 1 ? "forward" : "reverse";
    const sequence = strand === "forward" ? raw : reverseComplement(raw);
    const item: SynthesisOligo = {
      index,
      start: start + 1,
      end,
      length: raw.length,
      strand,
      sequence,
      selfDimerScore: score.selfDimer,
      hairpinScore: score.hairpin,
      qualityScore: score.quality,
    };

    if (end >= seq.length) {
      oligos.push(item);
      break;
    }

    let bestOverlap = minOverlap;
    let bestOverlapScore = Number.MAX_VALUE;
    for (let ov = minOverlap; ov <= maxOverlap; ov++) {
      if (end - ov <= start) continue;
      const overlapSeq = seq.slice(end - ov, end);
      const tm = calculateTm(overlapSeq, naConc, primerConc);
      const tmDelta = Math.abs(tm - targetOverlapTm);
      const overlapGcPenalty = Math.abs(calculateGCContent(overlapSeq) - 50) / 15;
      const overlapScore = tmDelta * 2 + overlapGcPenalty;
      if (overlapScore < bestOverlapScore) {
        bestOverlapScore = overlapScore;
        bestOverlap = ov;
      }
    }
    item.overlapWithNext = bestOverlap;
    item.overlapTm = calculateTm(seq.slice(end - bestOverlap, end), naConc, primerConc);
    oligos.push(item);

    const nextStart = end - bestOverlap;
    if (nextStart <= start) return null;
    start = nextStart;
  }
  if (!oligos.length || guard >= 500) return null;
  return oligos;
}

export function designSynthesisOligos(template: string, params: PrimerParams = {}): SynthesisDesignResult | null {
  const seq = normalizeDna(template);
  if (!seq || !/^[ATCG]+$/.test(seq)) return null;
  const p = toRequiredParams(params);
  const primerLength = Math.max(25, Math.floor(p.synthesisOligoLength));
  const linkerLength = Math.max(0, Math.floor(p.synthesisMinOverlap));
  const step = 2 * primerLength - 2 * linkerLength;
  if (step <= 0) return null;

  const complementMap: Record<string, string> = { A: "T", T: "A", C: "G", G: "C" };
  const complement = seq.split("").map((b) => complementMap[b] || b).join("");
  const reverse = (s: string) => s.split("").reverse().join("");
  const mod = (a: number, b: number) => ((a % b) + b) % b;

  const e = mod(seq.length - (2 * primerLength - linkerLength), step);
  const f = Math.max(1, Math.floor((seq.length - (2 * primerLength - linkerLength)) / step) + 1);
  const g = Math.round((25 - e) / f);
  const n = Math.max(25, e >= 25 ? primerLength : primerLength - g);
  const denom = 2 * n - 2 * linkerLength;
  if (denom <= 0) return null;
  const k = Math.max(1, 2 * (Math.floor((seq.length - (2 * n - linkerLength)) / denom) + 2));

  const oligos: SynthesisOligo[] = [];
  for (let idx = 1; idx <= k; idx++) {
    const m = (Math.round(idx / 2) - 1) * denom + 1 - ((idx % 2) - 1) * (n - linkerLength);
    const start = Math.max(1, m);
    const zero = start - 1;
    const oddRaw = seq.slice(zero, zero + n);
    const evenRaw = complement.slice(zero, zero + n);
    const currentLen = idx % 2 === 1 ? oddRaw.length : evenRaw.length;
    let finalSeq = "";
    let strand: "forward" | "reverse" = idx % 2 === 1 ? "forward" : "reverse";
    if (idx % 2 === 1) {
      finalSeq = currentLen >= 25 ? oddRaw : complement.slice(-25);
    } else {
      finalSeq = currentLen >= 25 ? reverse(evenRaw) : reverse(complement.slice(-25));
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
      overlapWithNext: idx < k ? linkerLength : undefined,
      selfDimerScore: est.selfDimer,
      hairpinScore: est.hairpin,
      qualityScore: est.quality,
    });
  }
  if (!oligos.length) return null;
  return {
    oligos,
    globalScore: 0,
    avgOverlapTmDelta: 0,
    maxSelfDimer: Math.max(...oligos.map((o) => o.selfDimerScore || 0)),
    maxHairpin: Math.max(...oligos.map((o) => o.hairpinScore || 0)),
  };
}

export function explainSynthesisDesignFailure(template: string, params: PrimerParams = {}): string {
  const seq = normalizeDna(template);
  if (!seq) return "模板序列为空";
  if (!/^[ATCG]+$/.test(seq)) return "基因合成引物仅支持ATCG序列，请先去除N或其他字符";
  const p = toRequiredParams(params);
  const primerLength = Math.max(25, Math.floor(p.synthesisOligoLength));
  const linkerLength = Math.max(0, Math.floor(p.synthesisMinOverlap));
  if (primerLength < 25) return "引物长度不能小于 25";
  if (linkerLength < 0) return "linker长度不能小于 0";
  if (2 * primerLength - 2 * linkerLength <= 0) return "参数无效：2*引物长度-2*linker长度 必须大于 0";
  return "当前参数无法按公式切分出有效引物，请调整引物长度或linker长度";
}
