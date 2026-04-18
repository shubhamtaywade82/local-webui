import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs/promises";
import { KnowledgeEngine } from "@workspace/knowledge-engine";

const knowledge = new KnowledgeEngine(path.join(process.cwd(), "../../options-buying-kb"));

export default async function routes(app: FastifyInstance) {
  app.post("/upload", async (req, res) => {
    const data = await req.file();
    if (!data) {
      return res.status(400).send({ error: "No file uploaded" });
    }

    const kbDir = path.join(process.cwd(), "../../options-buying-kb");
    // Ensure the directly exists
    await fs.mkdir(kbDir, { recursive: true });

    // Sanitize filename to avoid directory traversal
    const safeFilename = data.filename.replace(/[^a-zA-Z0-9.-]/g, "_");
    const filePath = path.join(kbDir, safeFilename);

    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    // Trigger KnowledgeEngine refresh without waiting (it runs in background)
    knowledge.refresh().catch(console.error);

    return { success: true, message: "File uploaded successfully", filename: safeFilename };
  });

  app.get("/list", async (req, res) => {
    const files = knowledge.listAll();
    return { files, stats: knowledge.getStats() };
  });
}
