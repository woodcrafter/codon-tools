import { getDb } from "./db";
import { hostSpecies, restrictionEnzymes } from "../drizzle/schema";
import { CODON_TABLES, HOST_TO_TABLE } from "./codonTables";
import { sql } from "drizzle-orm";

const HOST_SPECIES_DATA = [
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
  { name: "N. benthamiana", scientificName: "Nicotiana benthamiana", category: "plant" },
];

const ENZYMES_DATA = [
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
  { name: "BsaI", recognitionSequence: "GGTCTC", cutPattern: undefined, overhang: undefined, isCommon: true },
  { name: "BsmBI", recognitionSequence: "CGTCTC", cutPattern: undefined, overhang: undefined, isCommon: true },
  { name: "BbsI", recognitionSequence: "GAAGAC", cutPattern: undefined, overhang: undefined, isCommon: false },
  { name: "SapI", recognitionSequence: "GCTCTTC", cutPattern: undefined, overhang: undefined, isCommon: false },
];

export async function seedDatabaseIfEmpty() {
  try {
    const db = await getDb();

    const hostCount = await db.select({ count: sql<number>`count(*)` }).from(hostSpecies);
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
          codonTable: codonTable,
          isActive: true,
          updatedAt: new Date(),
        }).onConflictDoNothing();
      }
      console.log(`[Seed] Inserted ${HOST_SPECIES_DATA.length} host species`);
    } else {
      console.log(`[Seed] Host species already seeded (${hostCount[0]?.count} rows)`);
    }

    const enzymeCount = await db.select({ count: sql<number>`count(*)` }).from(restrictionEnzymes);
    if (Number(enzymeCount[0]?.count ?? 0) === 0) {
      console.log("[Seed] Inserting default restriction enzymes...");
      for (const e of ENZYMES_DATA) {
        await db.insert(restrictionEnzymes).values({
          name: e.name,
          recognitionSequence: e.recognitionSequence,
          cutPattern: e.cutPattern ?? null,
          overhang: e.overhang as any,
          isCommon: e.isCommon,
          updatedAt: new Date(),
        }).onConflictDoNothing();
      }
      console.log(`[Seed] Inserted ${ENZYMES_DATA.length} restriction enzymes`);
    } else {
      console.log(`[Seed] Restriction enzymes already seeded (${enzymeCount[0]?.count} rows)`);
    }
  } catch (err: any) {
    console.error("[Seed] Failed to seed database:", err?.message ?? err);
    // Don't throw - app should still work even if seed fails
  }
}
