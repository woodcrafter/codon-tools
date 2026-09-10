import { describe, expect, it } from "vitest";
import {
  analyzeRepeatStats,
  buildRetainConstraint,
  optimizeSequenceAuto,
  raiseCaiAboveThreshold,
  scoreDnaSequence,
} from "./codonOptimization";
import { eliminateAvoidEnzymeSites, polishRepeats } from "./codonOptimizationStrategy";

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

function translate(dna: string): string {
  let protein = "";
  for (let i = 0; i + 3 <= dna.length; i += 3) {
    protein += GENETIC_CODE[dna.slice(i, i + 3)] || "?";
  }
  return protein;
}

describe("eliminateAvoidEnzymeSites", () => {
  it("removes a site aligned to the codon frame (GAA TTC = E F)", () => {
    const seq = "ATG" + "GAATTC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"]);
    expect(result.sequence).not.toContain("GAATTC");
    expect(result.removed).toBe(1);
    expect(result.remainingSites).toEqual([]);
    expect(result.sequence.length).toBe(seq.length);
    expect(translate(result.sequence)).toBe(translate(seq));
  });

  it("removes a site spanning a codon boundary", () => {
    // R I Q: AGA ATT CAA contains GAATTC starting at offset 1
    const seq = "ATG" + "AGAATTCAA" + "AAA";
    expect(seq).toContain("GAATTC");
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"]);
    expect(result.sequence).not.toContain("GAATTC");
    expect(result.removed).toBe(1);
    expect(translate(result.sequence)).toBe(translate(seq));
  });

  it("removes multiple sites of different enzymes", () => {
    // M E F K G S K: contains GAATTC and GGATCC
    const seq = "ATG" + "GAATTC" + "AAA" + "GGATCC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC", "GGATCC"]);
    expect(result.sequence).not.toContain("GAATTC");
    expect(result.sequence).not.toContain("GGATCC");
    expect(result.removed).toBe(2);
    expect(translate(result.sequence)).toBe(translate(seq));
  });

  it("prefers the highest-weight synonymous codon when a codon table is given", () => {
    const codonTable = {
      E: { GAA: 0.3, GAG: 0.7 },
      F: { TTT: 0.4, TTC: 0.6 },
    };
    const seq = "ATG" + "GAATTC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"], codonTable);
    expect(result.sequence).not.toContain("GAATTC");
    expect(result.sequence.slice(3, 9)).toBe("GAGTTC");
  });

  it("chooses the site-breaking substitution with the smallest CAI cost", () => {
    const codonTable = {
      E: { GAA: 0.68, GAG: 0.32 },
      F: { TTT: 0.57, TTC: 0.43 },
    };
    const seq = "ATG" + "GAATTC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"], codonTable);
    expect(result.sequence.slice(3, 9)).toBe("GAATTT");
  });

  it("removes a non-palindromic site in its reverse-complement orientation", () => {
    const seq = "ATG" + "GAGACC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GGTCTC"]);
    expect(result.sequence).not.toContain("GGTCTC");
    expect(result.sequence).not.toContain("GAGACC");
    expect(translate(result.sequence)).toBe(translate(seq));
  });

  it("returns the sequence unchanged when no sites are present", () => {
    const seq = "ATGGCCAAAAGTAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC", "GGATCC"]);
    expect(result.sequence).toBe(seq);
    expect(result.removed).toBe(0);
  });

  it("returns the sequence unchanged when no enzymes are avoided", () => {
    const seq = "ATGGAATTCAAA";
    const result = eliminateAvoidEnzymeSites(seq, []);
    expect(result.sequence).toBe(seq);
    expect(result.removed).toBe(0);
  });

  it("does not touch stop codons and reports sites it cannot remove", () => {
    // GAATTC spanning the stop codon TGA cannot be fixed synonymously
    const seq = "ATG" + "TGAATTCAA";
    expect(seq).toContain("GAATTC");
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"]);
    expect(result.sequence.slice(3, 6)).toBe("TGA");
    expect(translate(result.sequence)).toBe(translate(seq));
  });

  it("never touches codons protected by retain-enzyme constraints", () => {
    // E F at codons 1-2 form GAATTC; protecting both codons makes it unfixable
    const seq = "ATG" + "GAATTC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC"], undefined, new Set([1, 2]));
    expect(result.sequence).toBe(seq);
    expect(result.removed).toBe(0);
    expect(result.remainingSites).toEqual(["GAATTC"]);
  });

  it("still fixes unprotected sites while leaving protected codons intact", () => {
    // protected GAATTC at codons 1-2, fixable GGATCC at codons 4-5
    const seq = "ATG" + "GAATTC" + "AAA" + "GGATCC" + "AAA";
    const result = eliminateAvoidEnzymeSites(seq, ["GAATTC", "GGATCC"], undefined, new Set([1, 2]));
    expect(result.sequence.slice(3, 9)).toBe("GAATTC"); // protected, untouched
    expect(result.sequence).not.toContain("GGATCC");
    expect(result.removed).toBe(1);
    expect(result.remainingSites).toEqual(["GAATTC"]);
    expect(translate(result.sequence)).toBe(translate(seq));
  });
});

describe("polishRepeats", () => {
  it("reduces repeats while preserving a retained site, translation, and CAI", () => {
    const source = "ATG" + "GAATTC" + "AAA" + "GCT".repeat(20) + "TAA";
    const protectedCodonIndexes = [1, 2];
    const baseline = raiseCaiAboveThreshold(source, {
      hostSpecies: "E. coli",
      protectedCodonIndexes,
    });
    const before = analyzeRepeatStats(baseline);
    const result = polishRepeats(baseline, {
      hostSpecies: "E. coli",
      retainEnzymes: ["GAATTC"],
      sourceDnaSequence: source,
      eliminateRepeats: true,
    });
    const after = analyzeRepeatStats(result.sequence);

    expect(result.sequence).toContain("GAATTC");
    expect(translate(result.sequence)).toBe(translate(source));
    expect(scoreDnaSequence(result.sequence, "E. coli").cai).toBeGreaterThanOrEqual(0.8);
    expect(after.total).toBeLessThan(before.total);
  });
});

describe("sequence type detection", () => {
  it("treats an ATGC-only sequence as DNA rather than a protein sequence", () => {
    const source = "ATG" + "GAATTC" + "AAA" + "GCT".repeat(12) + "TAA";
    const result = optimizeSequenceAuto(source, {
      hostSpecies: "E. coli",
      retainEnzymes: ["GAATTC"],
    });

    expect(result.optimizedSequence.length).toBe(source.length);
    expect(translate(result.optimizedSequence)).toBe(translate(source));
    expect(result.optimizedSequence).toContain("GAATTC");
    expect(result.cai).toBeGreaterThanOrEqual(0.8);
  });
});

describe("retain-site orientation", () => {
  it("preserves a non-palindromic site found only as a reverse complement", () => {
    const source = "ATG" + "GAGACC" + "AAA";
    const constraint = buildRetainConstraint(source, ["GGTCTC"]);

    expect(constraint.missingSites).toEqual([]);
    expect(constraint.normalizedSites).toEqual(["GAGACC"]);
    expect(constraint.expectedSiteCounts.GAGACC).toBe(1);
    expect(constraint.protectedCodonIndexes).toEqual([1, 2]);
  });
});
