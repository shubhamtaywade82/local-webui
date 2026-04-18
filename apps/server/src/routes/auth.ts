import { FastifyInstance } from 'fastify';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db } from '../services/db';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

export default async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });

    const existing = await db.findUserByEmail(email);
    if (existing) return reply.code(409).send({ error: 'email already registered' });

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const user = await db.createUser(email, passwordHash);
    const token = jwt.sign({ userId: (user as any).id, email }, JWT_SECRET, { expiresIn: '7d' });
    return reply.code(201).send({ token, userId: (user as any).id, email });
  });

  app.post('/login', async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) return reply.code(400).send({ error: 'email and password required' });

    const user = await db.findUserByEmail(email);
    if (!user) return reply.code(401).send({ error: 'invalid credentials' });

    const valid = await bcrypt.compare(password, (user as any).passwordHash);
    if (!valid) return reply.code(401).send({ error: 'invalid credentials' });

    const token = jwt.sign({ userId: (user as any).id, email }, JWT_SECRET, { expiresIn: '7d' });
    return reply.send({ token, userId: (user as any).id, email });
  });

  app.get('/me', async (req, reply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return reply.code(401).send({ error: 'unauthorized' });
    try {
      const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string; email: string };
      return reply.send({ userId: payload.userId, email: payload.email });
    } catch {
      return reply.code(401).send({ error: 'invalid token' });
    }
  });
}
