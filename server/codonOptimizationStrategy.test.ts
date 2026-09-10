import { describe, expect, it } from "vitest";
import { eliminateAvoidEnzymeSites } from "./codonOptimizationStrategy";

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
