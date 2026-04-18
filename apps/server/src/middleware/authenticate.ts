import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'local-dev-secret-change-in-prod';

export interface AuthenticatedRequest extends FastifyRequest {
  userId?: string;
  userEmail?: string;
}

export async function optionalAuth(req: AuthenticatedRequest, _reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) return;
  try {
    const payload = jwt.verify(authHeader.slice(7), JWT_SECRET) as { userId: string; email: string };
    req.userId = payload.userId;
    req.userEmail = payload.email;
  } catch {
    // unauthenticated — continue without userId
  }
}

export async function requireAuth(req: AuthenticatedRequest, reply: FastifyReply) {
  await optionalAuth(req, reply);
  if (!req.userId) return reply.code(401).send({ error: 'unauthorized' });
}
