import "dotenv/config";
import pg from "pg";

const { Client } = pg;

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("DATABASE_URL environment variable is required");
  process.exit(1);
}

async function seed() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();

  console.log("Seeding host species...");

  const hostSpeciesData = [
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

  for (const species of hostSpeciesData) {
    await client.query(
      `INSERT INTO "host_species" ("name", "scientificName", "category", "isActive")
       SELECT $1::varchar, $2::varchar, $3::varchar, true
       WHERE NOT EXISTS (SELECT 1 FROM "host_species" WHERE "name" = $1::varchar)`,
      [species.name, species.scientificName, species.category]
    );
  }

  console.log("Seeding restriction enzymes...");

  const enzymesData = [
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

  for (const enzyme of enzymesData) {
    await client.query(
      `INSERT INTO "restriction_enzymes" ("name", "recognitionSequence", "cutPattern", "overhang", "isCommon")
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ("name") DO NOTHING`,
      [enzyme.name, enzyme.recognitionSequence, enzyme.cutPattern, enzyme.overhang, enzyme.isCommon]
    );
  }

  console.log("Seeding vectors...");

  const vectorsData = [
    {
      name: "pET-28a(+)",
      description: "T7 promoter-based expression vector with N-terminal His-tag and thrombin cleavage site",
      vectorType: "expression",
      hostType: "E. coli",
      promoter: "T7",
      resistance: "Kanamycin",
      nTerminalTag: "6xHis",
      seamlessCloningCompatible: true,
    },
    {
      name: "pET-21a(+)",
      description: "T7 promoter-based expression vector with optional C-terminal His-tag",
      vectorType: "expression",
      hostType: "E. coli",
      promoter: "T7",
      resistance: "Ampicillin",
      cTerminalTag: "6xHis",
      seamlessCloningCompatible: true,
    },
    {
      name: "pGEX-4T-1",
      description: "GST fusion expression vector with thrombin cleavage site",
      vectorType: "expression",
      hostType: "E. coli",
      promoter: "tac",
      resistance: "Ampicillin",
      nTerminalTag: "GST",
      seamlessCloningCompatible: true,
    },
    {
      name: "pcDNA3.1(+) ",
      description: "Mammalian expression vector with CMV promoter",
      vectorType: "expression",
      hostType: "Mammalian",
      promoter: "CMV",
      resistance: "Ampicillin/Neomycin",
      seamlessCloningCompatible: true,
    },
    {
      name: "pCMV-Tag2B",
      description: "Mammalian expression vector with FLAG tag",
      vectorType: "expression",
      hostType: "Mammalian",
      promoter: "CMV",
      resistance: "Kanamycin",
      nTerminalTag: "FLAG",
      seamlessCloningCompatible: true,
    },
    {
      name: "pUC19",
      description: "High-copy cloning vector",
      vectorType: "cloning",
      hostType: "E. coli",
      promoter: "lac",
      resistance: "Ampicillin",
      seamlessCloningCompatible: true,
    },
    {
      name: "pBluescript II SK(+) ",
      description: "Phagemid cloning vector with multiple cloning sites",
      vectorType: "cloning",
      hostType: "E. coli",
      promoter: "T7/T3",
      resistance: "Ampicillin",
      seamlessCloningCompatible: true,
    },
    {
      name: "pPIC9K",
      description: "Pichia pastoris expression vector with AOX1 promoter",
      vectorType: "expression",
      hostType: "Pichia pastoris",
      promoter: "AOX1",
      resistance: "Ampicillin/G418",
      seamlessCloningCompatible: true,
    },
  ];

  for (const vector of vectorsData) {
    await client.query(
      `INSERT INTO "vectors" (
         "name",
         "description",
         "sequence",
         "length",
         "vectorType",
         "hostType",
         "promoter",
         "resistance",
         "nTerminalTag",
         "cTerminalTag",
         "seamlessCloningCompatible",
         "isPublic"
       )
       SELECT $1::varchar, $2::text, 'PLACEHOLDER_SEQUENCE', 5000, $3::vector_type, $4::varchar, $5::varchar, $6::varchar, $7::varchar, $8::varchar, $9::boolean, true
       WHERE NOT EXISTS (SELECT 1 FROM "vectors" WHERE "name" = $1::varchar)`,
      [
        vector.name,
        vector.description,
        vector.vectorType,
        vector.hostType,
        vector.promoter,
        vector.resistance,
        vector.nTerminalTag ?? null,
        vector.cTerminalTag ?? null,
        vector.seamlessCloningCompatible,
      ]
    );
  }

  console.log("Seeding users...");

  const usersData = [
    { openId: "local:admin", username: "admin", name: "Admin User", email: "admin@test.local", role: "admin" },
    { openId: "local:tester", username: "tester", name: "Test User", email: "tester@test.local", role: "user" },
  ];

  for (const user of usersData) {
    await client.query(
      `INSERT INTO "users" ("openId", "username", "name", "email", "loginMethod", "role")
       VALUES ($1, $2, $3, $4, 'local', $5::user_role)
       ON CONFLICT ("openId") DO NOTHING`,
      [user.openId, user.username, user.name, user.email, user.role]
    );
  }

  const adminUser = await client.query(
    `SELECT "id" FROM "users" WHERE "openId" = 'local:admin' LIMIT 1`
  );
  const testerUser = await client.query(
    `SELECT "id" FROM "users" WHERE "openId" = 'local:tester' LIMIT 1`
  );
  const adminId = adminUser.rows[0]?.id;
  const testerId = testerUser.rows[0]?.id;

  if (!adminId || !testerId) {
    throw new Error("Seed users failed");
  }

  console.log("Seeding order templates...");

  const ecoliHost = await client.query(
    `SELECT "id" FROM "host_species" WHERE "name" = 'E. coli' LIMIT 1`
  );
  const yeastHost = await client.query(
    `SELECT "id" FROM "host_species" WHERE "name" = 'S. cerevisiae' LIMIT 1`
  );
  const pET28 = await client.query(
    `SELECT "id" FROM "vectors" WHERE "name" = 'pET-28a(+)' LIMIT 1`
  );

  const ecoliHostId = ecoliHost.rows[0]?.id ?? null;
  const yeastHostId = yeastHost.rows[0]?.id ?? null;
  const pET28Id = pET28.rows[0]?.id ?? null;

  await client.query(
    `INSERT INTO "order_templates" (
      "userId", "name", "description", "serviceType", "hostSpeciesId", "cloningMethod", "vectorId", "isDefault"
    )
    SELECT $1::integer, $2::varchar, $3::text, 'gene_synthesis'::service_type, $4::integer, 'seamless'::cloning_method, $5::integer, true
    WHERE NOT EXISTS (
      SELECT 1 FROM "order_templates" WHERE "userId" = $1::integer AND "name" = $2::varchar
    )`,
    [adminId, "Ecoli 常规模板", "大肠杆菌常规表达模板", ecoliHostId, pET28Id]
  );

  await client.query(
    `INSERT INTO "order_templates" (
      "userId", "name", "description", "serviceType", "hostSpeciesId", "cloningMethod", "vectorId", "isDefault"
    )
    SELECT $1::integer, $2::varchar, $3::text, 'gene_cloning'::service_type, $4::integer, 'restriction'::cloning_method, $5::integer, false
    WHERE NOT EXISTS (
      SELECT 1 FROM "order_templates" WHERE "userId" = $1::integer AND "name" = $2::varchar
    )`,
    [testerId, "酵母克隆模板", "酵母表达克隆模板", yeastHostId, pET28Id]
  );

  console.log("Seeding batch jobs...");

  await client.query(
    `INSERT INTO "batch_jobs" ("batchId", "userId", "totalCount", "completedCount", "failedCount", "status", "sourceFileName")
     SELECT 'BATCH-TEST-001', $1::integer, 3, 3, 0, 'completed'::batch_job_status, 'test-orders.csv'
     WHERE NOT EXISTS (SELECT 1 FROM "batch_jobs" WHERE "batchId" = 'BATCH-TEST-001')`,
    [adminId]
  );

  const batchJob = await client.query(
    `SELECT "id" FROM "batch_jobs" WHERE "batchId" = 'BATCH-TEST-001' LIMIT 1`
  );
  const batchJobId = batchJob.rows[0]?.id ?? null;

  console.log("Seeding orders...");

  await client.query(
    `INSERT INTO "orders" (
      "orderId", "userId", "batchJobId", "batchIndex", "geneName", "serviceType", "originalSequence", "sequenceType",
      "hostSpeciesId", "optimizedSequence", "caiScore", "gcContent", "cloningMethod", "vectorId", "status", "notes"
    )
    SELECT 'ORD-TEST-0001', $1::integer, $2::integer, 1, 'GFP', 'gene_synthesis'::service_type, 'ATGGTGAGCAAGGGCGAGGAG',
      'dna'::sequence_type, $3::integer, 'ATGGTGAGCAAGGGCGAGGAG', 0.91, 58.2, 'seamless'::cloning_method, $4::integer,
      'optimization_complete'::order_status, '测试订单：GFP'
    WHERE NOT EXISTS (SELECT 1 FROM "orders" WHERE "orderId" = 'ORD-TEST-0001')`,
    [adminId, batchJobId, ecoliHostId, pET28Id]
  );

  await client.query(
    `INSERT INTO "orders" (
      "orderId", "userId", "batchJobId", "batchIndex", "geneName", "serviceType", "originalSequence", "sequenceType",
      "hostSpeciesId", "status", "notes"
    )
    SELECT 'ORD-TEST-0002', $1::integer, $2::integer, 2, 'mCherry', 'gene_cloning'::service_type, 'ATGGTGAGCAAGGGCGAGGAGGATAACATGGC',
      'dna'::sequence_type, $3::integer, 'pending_optimization'::order_status, '测试订单：mCherry'
    WHERE NOT EXISTS (SELECT 1 FROM "orders" WHERE "orderId" = 'ORD-TEST-0002')`,
    [testerId, batchJobId, yeastHostId]
  );

  const order1 = await client.query(
    `SELECT "id" FROM "orders" WHERE "orderId" = 'ORD-TEST-0001' LIMIT 1`
  );
  const order2 = await client.query(
    `SELECT "id" FROM "orders" WHERE "orderId" = 'ORD-TEST-0002' LIMIT 1`
  );
  const order1Id = order1.rows[0]?.id ?? null;
  const order2Id = order2.rows[0]?.id ?? null;

  if (order1Id && order2Id) {
    await client.query(
      `INSERT INTO "order_activities" ("orderId", "userId", "action", "description")
       SELECT $1::integer, $2::integer, 'created', '订单已创建'
       WHERE NOT EXISTS (
         SELECT 1 FROM "order_activities"
         WHERE "orderId" = $1::integer AND "action" = 'created'
       )`,
      [order1Id, adminId]
    );
    await client.query(
      `INSERT INTO "order_activities" ("orderId", "userId", "action", "description")
       SELECT $1::integer, $2::integer, 'optimization_started', '已进入优化队列'
       WHERE NOT EXISTS (
         SELECT 1 FROM "order_activities"
         WHERE "orderId" = $1::integer AND "action" = 'optimization_started'
       )`,
      [order2Id, testerId]
    );
  }

  console.log("Seeding optimization jobs...");

  await client.query(
    `INSERT INTO "optimization_jobs" ("jobId", "userId", "hostSpeciesId")
     SELECT 'OPT-TEST-001', $1::integer, $2::integer
     WHERE NOT EXISTS (SELECT 1 FROM "optimization_jobs" WHERE "jobId" = 'OPT-TEST-001')`,
    [adminId, ecoliHostId]
  );

  const optimizationJob = await client.query(
    `SELECT "id" FROM "optimization_jobs" WHERE "jobId" = 'OPT-TEST-001' LIMIT 1`
  );
  const optimizationJobId = optimizationJob.rows[0]?.id ?? null;

  if (optimizationJobId) {
    await client.query(
      `INSERT INTO "optimization_results" (
        "jobId", "geneName", "avgGcContent", "hostName", "secondaryHostName", "avoidEnzymesDisplay", "originalSequence", "optimizedSequence", "caiScore"
      )
      SELECT $1::integer, 'GFP', 56.4, 'E. coli', null, 'EcoRI [GAATTC]', 'ATGGTGAGCAAGGGCGAGGAG', 'ATGGTTAGCAAAGGTGAGGAA', 0.902
      WHERE NOT EXISTS (
        SELECT 1 FROM "optimization_results" WHERE "jobId" = $1::integer AND "geneName" = 'GFP'
      )`,
      [optimizationJobId]
    );
  }

  console.log("Seed data inserted successfully!");
  await client.end();
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
