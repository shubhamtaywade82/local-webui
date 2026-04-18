import { Sequelize, DataTypes, Model } from 'sequelize';

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace', {
  logging: false,
});

class User extends Model {
  declare id: string;
  declare email: string;
  declare passwordHash: string;
  declare createdAt: Date;
}

User.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  email: { type: DataTypes.TEXT, allowNull: false, unique: true },
  passwordHash: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'user',
  underscored: true,
  updatedAt: false,
});

class Conversation extends Model {
  declare id: string;
  declare title: string;
  declare model: string;
  declare userId: string | null;
  declare createdAt: Date;
}

Conversation.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  title: DataTypes.TEXT,
  model: DataTypes.TEXT,
  userId: { type: DataTypes.UUID, allowNull: true },
}, {
  sequelize,
  modelName: 'conversation',
  underscored: true,
  updatedAt: false,
});

class Message extends Model {
  declare id: string;
  declare conversationId: string;
  declare role: string;
  declare content: string;
  declare createdAt: Date;
}

Message.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  role: DataTypes.TEXT,
  content: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'message',
  underscored: true,
  updatedAt: false,
});

class Artifact extends Model {
  declare id: string;
  declare conversationId: string;
  declare fileType: string;
  declare rawContent: string;
  declare filePath: string;
  declare createdAt: Date;
}

Artifact.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  fileType: DataTypes.TEXT,
  rawContent: DataTypes.TEXT,
  filePath: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'artifact',
  underscored: true,
  updatedAt: false,
});

class AgentExecution extends Model {
  declare id: string;
  declare messageId: string;
  declare toolName: string;
  declare toolInput: Record<string, unknown>;
  declare toolOutput: Record<string, unknown>;
  declare durationMs: number;
  declare status: 'success' | 'error' | 'timeout';
  declare createdAt: Date;
}

AgentExecution.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  toolName: DataTypes.TEXT,
  toolInput: DataTypes.JSONB,
  toolOutput: DataTypes.JSONB,
  durationMs: DataTypes.INTEGER,
  status: DataTypes.TEXT,
}, {
  sequelize,
  modelName: 'agent_execution',
  underscored: true,
  updatedAt: false,
});

class ConversationSummary extends Model {
  declare id: string;
  declare conversationId: string;
  declare summary: string;
  declare messageCount: number;
  declare createdAt: Date;
}

ConversationSummary.init({
  id: { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  summary: DataTypes.TEXT,
  messageCount: DataTypes.INTEGER,
}, {
  sequelize,
  modelName: 'conversation_summary',
  underscored: true,
  updatedAt: false,
});

// Associations
User.hasMany(Conversation, { foreignKey: 'userId' });
Conversation.belongsTo(User, { foreignKey: 'userId' });

Conversation.hasMany(Message, { foreignKey: 'conversationId' });
Message.belongsTo(Conversation, { foreignKey: 'conversationId' });

Conversation.hasMany(Artifact, { foreignKey: 'conversationId' });
Artifact.belongsTo(Conversation, { foreignKey: 'conversationId' });

Message.hasMany(AgentExecution, { foreignKey: 'messageId' });
AgentExecution.belongsTo(Message, { foreignKey: 'messageId' });

Conversation.hasOne(ConversationSummary, { foreignKey: 'conversationId' });
ConversationSummary.belongsTo(Conversation, { foreignKey: 'conversationId' });

// Sync schema. `alter` updates existing tables in dev when models gain columns.
// Production often sets NODE_ENV=production (alter off); `patchConversationUserIdColumn`
// still adds `user_id` if missing so authenticated GET /conversations does not 500.
const syncOptions = { alter: process.env.NODE_ENV !== 'production' };

async function patchConversationUserIdColumn(): Promise<void> {
  try {
    await sequelize.query(
      'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE SET NULL'
    );
  } catch {
    await sequelize.query(
      'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS user_id UUID'
    );
  }
}

/** Call once before `listen` so tables exist and legacy DBs get required columns. */
export async function initDatabase(): Promise<void> {
  await sequelize.sync(syncOptions);
  await patchConversationUserIdColumn();
  console.log('Database synced with Sequelize');
}

export const db = {
  async createUser(email: string, passwordHash: string) {
    return User.create({ email, passwordHash });
  },

  async findUserByEmail(email: string) {
    return User.findOne({ where: { email } });
  },

  async findUserById(id: string) {
    return User.findByPk(id);
  },

  async saveMessage(conversationId: string, role: string, content: string) {
    return Message.create({ conversationId, role, content });
  },

  async getMessages(conversationId: string) {
    return Message.findAll({
      where: { conversationId },
      order: [['createdAt', 'ASC']],
      attributes: ['id', 'role', 'content', 'createdAt']
    });
  },

  async createConversation(title: string, model: string, userId?: string) {
    const id = crypto.randomUUID();
    await Conversation.create({ id, title, model, userId: userId ?? null });
    return id;
  },

  /** Ensure a row exists for this id (client-generated UUIDs). Idempotent; races → unique key → ignored. */
  async ensureConversation(id: string, title: string, model: string, userId?: string) {
    const existing = await Conversation.findByPk(id);
    if (existing) return;
    try {
      await Conversation.create({ id, title, model, userId: userId ?? null });
    } catch (e: unknown) {
      const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
      if (name === 'SequelizeUniqueConstraintError') return;
      throw e;
    }
  },

  async listConversations(userId?: string) {
    const where: Record<string, unknown> = userId ? { userId } : {};
    return Conversation.findAll({
      where,
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'model', 'createdAt'],
      limit: 50
    });
  },

  async deleteConversation(id: string) {
    await ConversationSummary.destroy({ where: { conversationId: id } });
    await Artifact.destroy({ where: { conversationId: id } });
    await Message.destroy({ where: { conversationId: id } });
    await Conversation.destroy({ where: { id } });
  },

  async renameConversation(id: string, title: string) {
    await Conversation.update({ title }, { where: { id } });
  },

  async saveAgentExecution(
    messageId: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    toolOutput: Record<string, unknown>,
    durationMs: number,
    status: 'success' | 'error' | 'timeout'
  ) {
    return AgentExecution.create({ messageId, toolName, toolInput, toolOutput, durationMs, status });
  },

  async saveArtifact(conversationId: string, fileType: string, rawContent: string, filePath: string) {
    return Artifact.create({ conversationId, fileType, rawContent, filePath });
  },

  async getAgentExecutions(messageId: string) {
    return AgentExecution.findAll({ where: { messageId }, order: [['createdAt', 'ASC']] });
  },

  async getSummary(conversationId: string): Promise<{ summary: string; messageCount: number } | null> {
    const row = await ConversationSummary.findOne({ where: { conversationId } });
    if (!row) return null;
    return { summary: row.summary, messageCount: row.messageCount };
  },

  /**
   * Persist rolling summary for long threads. Requires a `conversations` row — if the DB has
   * orphaned messages (no parent row), we create the parent first to satisfy FK constraints.
   */
  async upsertSummary(
    conversationId: string,
    summary: string,
    messageCount: number,
    meta?: { title?: string; model?: string; userId?: string | null }
  ) {
    let conv = await Conversation.findByPk(conversationId);
    if (!conv) {
      const title = (meta?.title ?? 'Chat').slice(0, 500);
      const model = meta?.model ?? 'default';
      const userId = meta?.userId ?? null;
      try {
        await Conversation.create({ id: conversationId, title, model, userId });
      } catch (e: unknown) {
        const name = e && typeof e === 'object' && 'name' in e ? String((e as { name: string }).name) : '';
        if (name === 'SequelizeUniqueConstraintError') {
          // Another request created the row
        } else {
          throw e;
        }
      }
      conv = await Conversation.findByPk(conversationId);
    }
    if (!conv) {
      console.warn(`[db] upsertSummary: no conversation row for ${conversationId}; skip summary write`);
      return;
    }

    const existing = await ConversationSummary.findOne({ where: { conversationId } });
    if (existing) {
      await existing.update({ summary, messageCount });
    } else {
      await ConversationSummary.create({ conversationId, summary, messageCount });
    }
  },
};
