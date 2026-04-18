import { FastifyInstance } from "fastify";
import { db } from "../services/db";

export default async function routes(app: FastifyInstance) {
  // List all conversations
  app.get("/", async (_req, res) => {
    try {
      const conversations = await db.listConversations();
      return conversations;
    } catch (err) {
      console.error("[ConversationsRoute] List error:", err);
      res.code(500).send({ error: "Failed to list conversations" });
    }
  });

  // Get a single conversation with messages
  app.get<{ Params: { id: string } }>("/:id", async (req, res) => {
    try {
      const messages = await db.getMessages(req.params.id);
      return { id: req.params.id, messages };
    } catch (err) {
      console.error("[ConversationsRoute] Get error:", err);
      res.code(500).send({ error: "Failed to get conversation" });
    }
  });

  // Delete a conversation
  app.delete<{ Params: { id: string } }>("/:id", async (req, res) => {
    try {
      await db.deleteConversation(req.params.id);
      return { ok: true };
    } catch (err) {
      console.error("[ConversationsRoute] Delete error:", err);
      res.code(500).send({ error: "Failed to delete conversation" });
    }
  });

  // Rename a conversation
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
