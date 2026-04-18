import { Sequelize, DataTypes, Model, Op } from 'sequelize';

const sequelize = new Sequelize(process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace', {
  logging: false,
});

class Conversation extends Model {
  declare id: string;
  declare title: string;
  declare model: string;
  declare createdAt: Date;
}

Conversation.init({
  id: { type: DataTypes.UUID, primaryKey: true },
  title: DataTypes.TEXT,
  model: DataTypes.TEXT,
}, { 
  sequelize, 
  modelName: 'conversation',
  underscored: true,
  updatedAt: false, // Schema doesn't have updated_at for conversations
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
  updatedAt: false, // Schema doesn't have updated_at for messages
});

Conversation.hasMany(Message, { foreignKey: 'conversationId' });
Message.belongsTo(Conversation, { foreignKey: 'conversationId' });

// Sync database
sequelize.sync()
  .then(() => console.log('Database synced with Sequelize'))
  .catch(err => console.error('Database sync failed:', err));

export const db = {
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

  async createConversation(title: string, model: string) {
    const id = crypto.randomUUID();
    await Conversation.create({ id, title, model });
    return id;
  },

  /** Ensures a row exists for client-supplied conversation IDs (Web UI generates UUIDs locally). */
  async ensureConversation(id: string, title: string, model: string) {
    await Conversation.findOrCreate({
      where: { id },
      defaults: { title, model },
    });
  },

  async listConversations() {
    return Conversation.findAll({
      order: [['createdAt', 'DESC']],
      attributes: ['id', 'title', 'model', 'createdAt'],
      limit: 50
    });
  },

  async deleteConversation(id: string) {
    await Message.destroy({ where: { conversationId: id } });
    await Conversation.destroy({ where: { id } });
  },

  async renameConversation(id: string, title: string) {
    await Conversation.update({ title }, { where: { id } });
  }
};