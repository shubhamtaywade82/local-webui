import jwt from "jsonwebtoken";
import { FastifyInstance, FastifyRequest } from "fastify";
import { db } from "../services/db";

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-prod';

function getUserId(req: FastifyRequest): string | undefined {
  const auth = req.headers.authorization as string | undefined;
  if (!auth?.startsWith('Bearer ')) return undefined;
  try {
    const p = jwt.verify(auth.slice(7), JWT_SECRET) as { userId: string };
    return p.userId;
  } catch { return undefined; }
}

export default async function routes(app: FastifyInstance) {
  app.get("/", async (req, res) => {
    try {
      const conversations = await db.listConversations(getUserId(req));
      return conversations;
    } catch (err) {
      console.error("[ConversationsRoute] List error:", err);
      res.code(500).send({ error: "Failed to list conversations" });
    }
  });

  app.get<{ Params: { id: string } }>("/:id", async (req, res) => {
    try {
      const messages = await db.getMessages(req.params.id);
      return { id: req.params.id, messages };
    } catch (err) {
      console.error("[ConversationsRoute] Get error:", err);
      res.code(500).send({ error: "Failed to get conversation" });
    }
  });

  app.delete<{ Params: { id: string } }>("/:id", async (req, res) => {
    try {
      await db.deleteConversation(req.params.id);
      return { ok: true };
    } catch (err) {
      console.error("[ConversationsRoute] Delete error:", err);
      res.code(500).send({ error: "Failed to delete conversation" });
    }
  });

  app.patch<{ Params: { id: string }; Body: { title: string } }>("/:id", async (req, res) => {
    try {
      await db.renameConversation(req.params.id, req.body.title);
      return { ok: true };
    } catch (err) {
      console.error("[ConversationsRoute] Rename error:", err);
      res.code(500).send({ error: "Failed to rename conversation" });
    }
  });
}
