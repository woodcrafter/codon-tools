import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import express from "express";
import multer from "multer";
import { parseFile } from "seqparse";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { initDb } from "../db";
import { seedDatabaseIfEmpty } from "../seed";

export function loadEnv() {
  const here = path.dirname(fileURLToPath(import.meta.url));

  const candidates = [
    path.resolve(process.cwd(), ".env"),
    path.resolve(here, "../.env"),
    path.resolve(here, "../../.env"),
    path.resolve(here, "../../../.env"),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      dotenv.config({ path: candidate });
      return candidate;
    }
  }

  dotenv.config();
  return null;
}

loadEnv();

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

export async function startServer(): Promise<{ port: number }> {
  const app = express();
  const server = createServer(app);
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
  app.post("/api/vectors/parse-sequence-file", upload.single("file"), async (req, res) => {
    try {
      const file = req.file;
      if (!file) return res.status(400).json({ error: "未选择文件" });
      const arrayBuffer = file.buffer.buffer.slice(
        file.buffer.byteOffset,
        file.buffer.byteOffset + file.buffer.byteLength
      ) as ArrayBuffer;
      const seqs = await parseFile(" ", { source: arrayBuffer, fileName: file.originalname });
      const sequences = seqs.map(s => ({
        name: s.name || file.originalname.replace(/\.[^.]+$/, "") || "Untitled",
        sequence: s.seq,
      }));
      res.json({ sequences });
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "解析失败" });
    }
  });

  app.post("/api/vectors/parse-sequence-text", express.json({ limit: "10mb" }), async (req, res) => {
    try {
      const { content, fileName } = req.body as { content?: string; fileName?: string };
      if (!content || typeof content !== "string" || !fileName || typeof fileName !== "string") {
        return res.status(400).json({ error: "缺少 content 或 fileName" });
      }
      const seqs = await parseFile(content.trim() || " ", { fileName });
      const sequences = seqs.map(s => ({
        name: s.name || fileName.replace(/\.[^.]+$/, "") || "Untitled",
        sequence: s.seq,
      }));
      res.json({ sequences });
    } catch (e: any) {
      res.status(400).json({ error: e?.message ?? "解析失败" });
    }
  });

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  return new Promise<{ port: number }>((resolve) => {
    server.listen(port, async () => {
      console.log(`Server running on http://localhost:${port}/`);
      // Initialize the embedded database (schema bootstrap) and seed defaults.
      await initDb();
      await seedDatabaseIfEmpty();
      resolve({ port });
    });
  });
}

// Auto-start when run directly (`node dist/index.js` or `tsx`), but NOT when the
// module is imported by the Electron main process — that starts the server
// explicitly after configuring the embedded database's data directory. Starting
// twice would make two PGlite instances contend for the same data dir lock.
if (!process.versions.electron) {
  startServer().catch(console.error);
}
