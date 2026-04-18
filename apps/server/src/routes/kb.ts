import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs/promises";
import { knowledgeEngine } from "../services/knowledgeSingleton";
import { resolveKnowledgeRoot } from "../config/knowledgeRoot";

const knowledge = knowledgeEngine;

export default async function routes(app: FastifyInstance) {
  app.post("/upload", async (req, res) => {
    const data = await req.file();
    if (!data) {
      return res.status(400).send({ error: "No file uploaded" });
    }

    const kbDir = resolveKnowledgeRoot();
    // Ensure the directory exists
    await fs.mkdir(kbDir, { recursive: true });

    // Sanitize filename to avoid directory traversal
    const safeFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = path.join(kbDir, safeFilename);

    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    // Trigger persistent ingestion in background
    knowledge.ingest().catch(console.error);

    return { success: true, message: "File uploaded successfully", filename: safeFilename };
  });

  app.get("/list", async (req, res) => {
    const files = knowledge.listAll();
    return { files, stats: knowledge.getStats() };
  });
}
