import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs/promises";
import { knowledgeEngine } from "../services/knowledgeSingleton";

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children?: FileNode[];
}

const WORKSPACE_ROOT = path.join(process.cwd(), "../../workspace");

async function buildFileTree(dir: string): Promise<FileNode[]> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const nodes = await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(WORKSPACE_ROOT, fullPath);
      const node: FileNode = {
        name: entry.name,
        path: relativePath,
        isDir: entry.isDirectory()
      };
      if (node.isDir) {
        node.children = await buildFileTree(fullPath);
      }
      return node;
    }));
    // Sort directories first
    return nodes.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    return [];
  }
}

export default async function routes(app: FastifyInstance) {
  // Ensure workspace exists
  app.addHook("onReady", async () => {
    await fs.mkdir(WORKSPACE_ROOT, { recursive: true });
  });

  app.get("/list", async () => {
    return { tree: await buildFileTree(WORKSPACE_ROOT) };
  });

  app.get("/read", async (req: any, res) => {
    const { path: filePath } = req.query;
    if (!filePath) return res.status(400).send({ error: "Missing path" });
    
    const fullPath = path.join(WORKSPACE_ROOT, filePath);
    if (!fullPath.startsWith(WORKSPACE_ROOT)) {
      return res.status(403).send({ error: "Access denied" });
    }

    try {
      const content = await fs.readFile(fullPath, "utf-8");
      return { content };
    } catch (err) {
      return res.status(404).send({ error: "File not found" });
    }
  });

  app.post("/write", async (req: any, res) => {
    const { path: filePath, content } = req.body;
    if (!filePath) return res.status(400).send({ error: "Missing path" });

    const fullPath = path.join(WORKSPACE_ROOT, filePath);
    if (!fullPath.startsWith(WORKSPACE_ROOT)) {
      return res.status(403).send({ error: "Access denied" });
    }

    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content, "utf-8");
    return { success: true };
  });

  app.delete("/delete", async (req: any, res) => {
    const { path: filePath } = req.query;
    if (!filePath) return res.status(400).send({ error: "Missing path" });

    const fullPath = path.join(WORKSPACE_ROOT, filePath);
    if (!fullPath.startsWith(WORKSPACE_ROOT)) {
      return res.status(403).send({ error: "Access denied" });
    }

    try {
      const stats = await fs.stat(fullPath);
      if (stats.isDirectory()) {
        await fs.rm(fullPath, { recursive: true });
      } else {
        await fs.unlink(fullPath);
      }
      return { success: true };
    } catch (err) {
      return res.status(404).send({ error: "File or directory not found" });
    }
  });
}
