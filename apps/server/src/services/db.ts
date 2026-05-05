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

// ── Trading models ──────────────────────────────────────────────────────────

class FuturesInstrument extends Model {
  declare id: string;
  declare pair: string;
  declare status: string;
  declare metadata: Record<string, unknown>;
  declare updatedAt: Date;
}
FuturesInstrument.init({
  id:       { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  pair:     { type: DataTypes.TEXT, allowNull: false, unique: true },
  status:   { type: DataTypes.TEXT, allowNull: false, defaultValue: 'active' },
  metadata: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize, modelName: 'futures_instrument', underscored: true, createdAt: false });

class CandleSnapshot extends Model {
  declare id: string;
  declare pair: string;
  declare timeframe: string;
  declare candles: unknown[];
  declare asOf: Date;
  declare updatedAt: Date;
}
CandleSnapshot.init({
  id:        { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  pair:      { type: DataTypes.TEXT, allowNull: false },
  timeframe: { type: DataTypes.TEXT, allowNull: false },
  candles:   { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  asOf:      { type: DataTypes.DATE, allowNull: false },
}, {
  sequelize, modelName: 'candle_snapshot', underscored: true, createdAt: false,
  indexes: [{ unique: true, fields: ['pair', 'timeframe'] }],
});

class TradeSignal extends Model {
  declare id: string;
  declare pair: string;
  declare direction: string;
  declare entryType: string;
  declare entry: number;
  declare stopLoss: number;
  declare takeProfit: number;
  declare confidence: number;
  declare reasons: string[];
  declare timeframes: Record<string, unknown>;
  declare status: string;
  declare createdAt: Date;
}
TradeSignal.init({
  id:          { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  pair:        { type: DataTypes.TEXT, allowNull: false },
  direction:   { type: DataTypes.TEXT, allowNull: false },
  entryType:   { type: DataTypes.TEXT, allowNull: false, defaultValue: 'market' },
  entry:       { type: DataTypes.FLOAT, allowNull: false },
  stopLoss:    { type: DataTypes.FLOAT, allowNull: false },
  takeProfit:  { type: DataTypes.FLOAT, allowNull: false },
  confidence:  { type: DataTypes.FLOAT, allowNull: false },
  reasons:     { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  timeframes:  { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
  status:      { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
}, { sequelize, modelName: 'trade_signal', underscored: true, updatedAt: false });

class Order extends Model {
  declare id: string;
  declare signalId: string | null;
  declare pair: string;
  declare side: string;
  declare quantity: number;
  declare leverage: number;
  declare orderType: string;
  declare pricePerUnit: number | null;
  declare exchangeOrderId: string | null;
  declare status: string;
  declare createdAt: Date;
}
Order.init({
  id:              { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  signalId:        { type: DataTypes.UUID, allowNull: true },
  pair:            { type: DataTypes.TEXT, allowNull: false },
  side:            { type: DataTypes.TEXT, allowNull: false },
  quantity:        { type: DataTypes.FLOAT, allowNull: false },
  leverage:        { type: DataTypes.INTEGER, allowNull: false },
  orderType:       { type: DataTypes.TEXT, allowNull: false },
  pricePerUnit:    { type: DataTypes.FLOAT, allowNull: true },
  exchangeOrderId: { type: DataTypes.TEXT, allowNull: true },
  status:          { type: DataTypes.TEXT, allowNull: false, defaultValue: 'pending' },
}, { sequelize, modelName: 'order', underscored: true, updatedAt: false });

class Position extends Model {
  declare id: string;
  declare orderId: string | null;
  declare pair: string;
  declare side: string;
  declare quantity: number;
  declare entryPrice: number;
  declare leverage: number;
  declare liquidationPrice: number | null;
  declare unrealisedPnl: number | null;
  declare status: string;
  declare createdAt: Date;
  declare updatedAt: Date;
}
Position.init({
  id:               { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  orderId:          { type: DataTypes.UUID, allowNull: true },
  pair:             { type: DataTypes.TEXT, allowNull: false },
  side:             { type: DataTypes.TEXT, allowNull: false },
  quantity:         { type: DataTypes.FLOAT, allowNull: false },
  entryPrice:       { type: DataTypes.FLOAT, allowNull: false },
  leverage:         { type: DataTypes.INTEGER, allowNull: false },
  liquidationPrice: { type: DataTypes.FLOAT, allowNull: true },
  unrealisedPnl:    { type: DataTypes.FLOAT, allowNull: true },
  status:           { type: DataTypes.TEXT, allowNull: false, defaultValue: 'open' },
}, { sequelize, modelName: 'position', underscored: true });

class Fill extends Model {
  declare id: string;
  declare orderId: string;
  declare price: number;
  declare quantity: number;
  declare fee: number;
  declare timestamp: Date;
}
Fill.init({
  id:        { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  orderId:   { type: DataTypes.UUID, allowNull: false },
  price:     { type: DataTypes.FLOAT, allowNull: false },
  quantity:  { type: DataTypes.FLOAT, allowNull: false },
  fee:       { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  timestamp: { type: DataTypes.DATE, allowNull: false },
}, { sequelize, modelName: 'fill', underscored: true, updatedAt: false, createdAt: false });

class ExecutionEvent extends Model {
  declare id: string;
  declare eventType: string;
  declare payload: Record<string, unknown>;
  declare createdAt: Date;
}
ExecutionEvent.init({
  id:        { type: DataTypes.UUID, primaryKey: true, defaultValue: DataTypes.UUIDV4 },
  eventType: { type: DataTypes.TEXT, allowNull: false },
  payload:   { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
}, { sequelize, modelName: 'execution_event', underscored: true, updatedAt: false });

// ── Associations ─────────────────────────────────────────────────────────────

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
// Temporarily disabling alter to avoid EADDRINUSE/migration loops during high-speed hot-reloads.
const syncOptions = { alter: false };

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
  // ── Trading helpers ──────────────────────────────────────────────────────

  async saveFuturesInstrument(pair: string, status: string, metadata: Record<string, unknown>) {
    const existing = await FuturesInstrument.findOne({ where: { pair } });
    if (existing) return existing.update({ status, metadata });
    return FuturesInstrument.create({ pair, status, metadata });
  },

  async listActiveFuturesInstruments() {
    return FuturesInstrument.findAll({ where: { status: 'active' } });
  },

  async upsertCandleSnapshot(pair: string, timeframe: string, candles: unknown[], asOf: Date) {
    const existing = await CandleSnapshot.findOne({ where: { pair, timeframe } });
    if (existing) return existing.update({ candles, asOf });
    return CandleSnapshot.create({ pair, timeframe, candles, asOf });
  },

  async getCandleSnapshot(pair: string, timeframe: string) {
    return CandleSnapshot.findOne({ where: { pair, timeframe } });
  },

  async saveTradeSignal(signal: {
    pair: string; direction: string; entryType: string; entry: number;
    stopLoss: number; takeProfit: number; confidence: number;
    reasons: string[]; timeframes: Record<string, unknown>; status?: string;
  }) {
    const row = await TradeSignal.create({ ...signal });
    return row.id;
  },

  async saveOrder(order: {
    signalId?: string; pair: string; side: string; quantity: number;
    leverage: number; orderType: string; pricePerUnit?: number;
    exchangeOrderId?: string; status?: string;
  }) {
    return Order.create({ ...order });
  },

  async updateOrderStatus(id: string, status: string, exchangeOrderId?: string) {
    await Order.update({ status, ...(exchangeOrderId ? { exchangeOrderId } : {}) }, { where: { id } });
  },

  async savePosition(position: {
    orderId?: string; pair: string; side: string; quantity: number;
    entryPrice: number; leverage: number; liquidationPrice?: number;
    unrealisedPnl?: number; status?: string;
  }) {
    return Position.create({ ...position });
  },

  async updatePosition(id: string, updates: Record<string, unknown>) {
    await Position.update(updates, { where: { id } });
  },

  async getOpenPosition(pair: string) {
    return Position.findOne({ where: { pair, status: 'open' } });
  },

  async saveFill(fill: { orderId: string; price: number; quantity: number; fee: number; timestamp: Date }) {
    return Fill.create({ ...fill });
  },

  async saveExecutionEvent(eventType: string, payload: Record<string, unknown>) {
    return ExecutionEvent.create({ eventType, payload });
  },

  // ── Summary helpers ───────────────────────────────────────────────────────

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
