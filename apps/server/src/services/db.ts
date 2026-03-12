import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace'
});

export const db = {
  query: (text: string, params?: any[]) => pool.query(text, params),
  
  async saveMessage(conversationId: string, role: string, content: string) {
    return this.query(
      'INSERT INTO messages (id, conversation_id, role, content) VALUES (gen_random_uuid(), $1, $2, $3)',
      [conversationId, role, content]
    );
  },

  async getMessages(conversationId: string) {
    const res = await this.query(
      'SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId]
    );
    return res.rows;
  },

  async createConversation(title: string, model: string) {
    const id = crypto.randomUUID();
    await this.query(
      'INSERT INTO conversations (id, title, model) VALUES ($1, $2, $3)',
      [id, title, model]
    );
    return id;
  }
};