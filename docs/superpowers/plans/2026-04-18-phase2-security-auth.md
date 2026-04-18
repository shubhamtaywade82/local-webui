# Phase 2: Security + Auth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full multi-user JWT auth, per-user DB isolation, and a PostgreSQL scoped sandbox schema with RBAC for the `query_database` tool.

**Architecture:** A new `packages/auth/` package handles password hashing (bcrypt) and JWT sign/verify. A `User` model is added with `userId` FK on all existing models. A Fastify middleware verifies Bearer tokens on all routes except `/auth/*`. The `query_database` tool is updated to connect via a restricted `agent_sandbox_user` DB user. The React frontend gains Login/Register pages, a `useAuthStore` Zustand store, and a `ProtectedRoute` wrapper.

**Tech Stack:** `bcrypt`, `jsonwebtoken`, `@types/jsonwebtoken`, `@types/bcrypt`, `zustand` (web), `react-router-dom` (web routing), vitest.

**Prerequisites:** Phase 1 complete and merged.

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `packages/auth/index.ts` | `hashPassword`, `verifyPassword`, `signToken`, `verifyToken` |
| Create | `packages/auth/package.json` | bcrypt, jsonwebtoken, vitest deps |
| Create | `packages/auth/tests/auth.test.ts` | Unit tests for hash/verify/sign/verify |
| Modify | `apps/server/src/services/db.ts` | Add `User` model, `userId` FK on Conversation/Artifact/AgentExecution |
| Create | `apps/server/src/routes/auth.ts` | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Create | `apps/server/src/middleware/authenticate.ts` | Fastify `preHandler` — verifies JWT, attaches `req.user` |
| Modify | `apps/server/src/server.ts` | Register auth routes + authenticate middleware |
| Create | `scripts/setup-agent-sandbox.sql` | PostgreSQL RBAC setup for agent sandbox |
| Modify | `packages/tools/db-tools.ts` | Add `agentPool` using `AGENT_SANDBOX_DB_URL`, swap `QueryDatabaseTool` to use it |
| Create | `apps/web/src/stores/useAuthStore.ts` | Zustand store: token, user, login, register, logout |
| Create | `apps/web/src/pages/LoginPage.tsx` | Login form |
| Create | `apps/web/src/pages/RegisterPage.tsx` | Register form |
| Create | `apps/web/src/components/ProtectedRoute.tsx` | Redirects to `/login` if no token |
| Modify | `apps/web/src/main.tsx` | Add React Router, route config |
| Modify | `apps/web/src/components/layout/Sidebar.tsx` | Add logout button + user display |
| Modify | `apps/web/src/stores/useChatStore.tsx` | Attach `Authorization` header to all API/WS calls |

---

## Task 1: auth package

**Files:**
- Create: `packages/auth/package.json`
- Create: `packages/auth/index.ts`
- Create: `packages/auth/tests/auth.test.ts`

- [ ] **Step 1: Create `packages/auth/package.json`**

```json
{
  "name": "@workspace/auth",
  "version": "1.0.0",
  "main": "index.ts",
  "types": "index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "bcrypt": "^5.1.1",
    "jsonwebtoken": "^9.0.2"
  },
  "devDependencies": {
    "@types/bcrypt": "^5.0.2",
    "@types/jsonwebtoken": "^9.0.6",
    "@types/node": "^20.0.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 2: Install**

```bash
pnpm install
```

- [ ] **Step 3: Write failing tests**

```typescript
import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, signToken, verifyToken } from '../index';

describe('hashPassword / verifyPassword', () => {
  it('hashes and verifies a password', async () => {
    const hash = await hashPassword('secret123');
    expect(hash).not.toBe('secret123');
    expect(await verifyPassword('secret123', hash)).toBe(true);
  });

  it('rejects wrong password', async () => {
    const hash = await hashPassword('correct');
    expect(await verifyPassword('wrong', hash)).toBe(false);
  });
});

describe('signToken / verifyToken', () => {
  const secret = 'test-secret-32-chars-minimum-len';

  it('signs and verifies a token', () => {
    const token = signToken('user-123', secret);
    const payload = verifyToken(token, secret);
    expect(payload.userId).toBe('user-123');
  });

  it('throws on tampered token', () => {
    const token = signToken('user-123', secret);
    expect(() => verifyToken(token + 'tamper', secret)).toThrow();
  });
});
```

- [ ] **Step 4: Run to verify failure**

```bash
cd packages/auth && pnpm test
```

Expected: FAIL — module not found.

- [ ] **Step 5: Implement `packages/auth/index.ts`**

```typescript
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export interface TokenPayload {
  userId: string;
  iat: number;
  exp: number;
}

export function signToken(userId: string, secret: string = requireSecret()): string {
  return jwt.sign({ userId }, secret, { expiresIn: '7d' });
}

export function verifyToken(token: string, secret: string = requireSecret()): TokenPayload {
  return jwt.verify(token, secret) as TokenPayload;
}

function requireSecret(): string {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is required');
  return s;
}
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd packages/auth && pnpm test
```

Expected: PASS — 4 tests green.

- [ ] **Step 7: Commit**

```bash
git add packages/auth/
git commit -m "feat: add auth package with bcrypt password hashing and JWT sign/verify"
```

---

## Task 2: Add User model, userId FK to existing models

**Files:**
- Modify: `apps/server/src/services/db.ts`

- [ ] **Step 1: Add `@workspace/auth` dependency to server**

Add to `apps/server/package.json` dependencies:
```json
"@workspace/auth": "workspace:*"
```

Run:
```bash
pnpm install
```

- [ ] **Step 2: Add User model before Conversation in `apps/server/src/services/db.ts`**

Add at the top after the sequelize instance:
```typescript
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
```

- [ ] **Step 3: Add `userId` field to Conversation, Artifact, AgentExecution models**

In `Conversation.init`, add to the fields object:
```typescript
userId: { type: DataTypes.UUID, allowNull: true },
```

In `Artifact.init`, add:
```typescript
userId: { type: DataTypes.UUID, allowNull: true },
```

In `AgentExecution.init`, add:
```typescript
userId: { type: DataTypes.UUID, allowNull: true },
```

- [ ] **Step 4: Add associations**

After `Message.belongsTo(Conversation, ...)`, add:
```typescript
User.hasMany(Conversation, { foreignKey: 'userId' });
Conversation.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(Artifact, { foreignKey: 'userId' });
Artifact.belongsTo(User, { foreignKey: 'userId' });
```

- [ ] **Step 5: Add User DB methods to the `db` export**

```typescript
async createUser(email: string, passwordHash: string): Promise<string> {
  const id = crypto.randomUUID();
  await User.create({ id, email, passwordHash });
  return id;
},

async findUserByEmail(email: string) {
  return User.findOne({ where: { email }, attributes: ['id', 'email', 'passwordHash'] });
},

async findUserById(id: string) {
  return User.findOne({ where: { id }, attributes: ['id', 'email'] });
},
```

Also update `createConversation` to accept `userId`:
```typescript
async createConversation(title: string, model: string, userId?: string) {
  const id = crypto.randomUUID();
  await Conversation.create({ id, title, model, userId });
  return id;
},
```

And update `listConversations` to scope by userId:
```typescript
async listConversations(userId?: string) {
  const where = userId ? { userId } : {};
  return Conversation.findAll({
    where,
    order: [['createdAt', 'DESC']],
    attributes: ['id', 'title', 'model', 'createdAt'],
    limit: 50
  });
},
```

- [ ] **Step 6: Verify DB sync**

```bash
pnpm dev
```

Expected: server starts, `Database synced with Sequelize`. Check:
```bash
psql $DATABASE_URL -c "\d conversations"
```
Expected: `user_id` column present.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/services/db.ts apps/server/package.json
git commit -m "feat: add User model with userId FK on Conversation, Artifact, AgentExecution"
```

---

## Task 3: Auth routes

**Files:**
- Create: `apps/server/src/routes/auth.ts`

- [ ] **Step 1: Write `apps/server/src/routes/auth.ts`**

```typescript
import { FastifyInstance } from 'fastify';
import { hashPassword, verifyPassword, signToken } from '@workspace/auth';
import { db } from '../services/db';

export default async function authRoutes(app: FastifyInstance) {
  app.post<{ Body: { email: string; password: string } }>('/register', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' });
    }
    if (password.length < 8) {
      return reply.status(400).send({ error: 'password must be at least 8 characters' });
    }

    const existing = await db.findUserByEmail(email);
    if (existing) {
      return reply.status(409).send({ error: 'email already registered' });
    }

    const passwordHash = await hashPassword(password);
    const userId = await db.createUser(email, passwordHash);
    const token = signToken(userId);
    return reply.send({ token, user: { id: userId, email } });
  });

  app.post<{ Body: { email: string; password: string } }>('/login', async (req, reply) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return reply.status(400).send({ error: 'email and password required' });
    }

    const user = await db.findUserByEmail(email);
    if (!user) {
      return reply.status(401).send({ error: 'invalid credentials' });
    }

    const valid = await verifyPassword(password, (user as any).passwordHash);
    if (!valid) {
      return reply.status(401).send({ error: 'invalid credentials' });
    }

    const token = signToken((user as any).id);
    return reply.send({ token, user: { id: (user as any).id, email } });
  });

  app.get('/me', async (req, reply) => {
    const user = (req as any).user;
    if (!user) return reply.status(401).send({ error: 'not authenticated' });
    const found = await db.findUserById(user.userId);
    if (!found) return reply.status(404).send({ error: 'user not found' });
    return reply.send({ user: { id: (found as any).id, email: (found as any).email } });
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/routes/auth.ts
git commit -m "feat: add register, login, and me auth routes"
```

---

## Task 4: Authenticate middleware

**Files:**
- Create: `apps/server/src/middleware/authenticate.ts`

- [ ] **Step 1: Write `apps/server/src/middleware/authenticate.ts`**

```typescript
import { FastifyRequest, FastifyReply } from 'fastify';
import { verifyToken } from '@workspace/auth';

export async function authenticate(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = req.headers.authorization;
  // Also check query param for WebSocket upgrade (headers limited during WS handshake)
  const tokenFromQuery = (req.query as any)?.token;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : tokenFromQuery;

  if (!token) {
    return reply.status(401).send({ error: 'authorization required' });
  }

  try {
    const payload = verifyToken(token);
    (req as any).user = payload;
  } catch {
    return reply.status(401).send({ error: 'invalid or expired token' });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/server/src/middleware/authenticate.ts
git commit -m "feat: add JWT authenticate middleware for Fastify"
```

---

## Task 5: Register routes in server.ts

**Files:**
- Modify: `apps/server/src/server.ts`

- [ ] **Step 1: Read current `apps/server/src/server.ts`**

Check the current route registration to understand how to add auth routes and middleware.

- [ ] **Step 2: Register auth routes (no auth required) and protect all others**

In `apps/server/src/server.ts`, import auth routes and authenticate middleware:

```typescript
import authRoutes from './routes/auth';
import { authenticate } from './middleware/authenticate';
```

Register auth routes before other routes (no middleware):
```typescript
app.register(authRoutes, { prefix: '/auth' });
```

Add `preHandler` hook for all other routes (add after registering auth routes):
```typescript
app.addHook('preHandler', async (req, reply) => {
  const isAuthRoute = req.url.startsWith('/auth/');
  const isHealth = req.url === '/health';
  if (!isAuthRoute && !isHealth) {
    await authenticate(req, reply);
  }
});
```

- [ ] **Step 3: Update conversations route to use userId**

In `apps/server/src/routes/conversations.ts`, update the list handler:

Find `const conversations = await db.listConversations();` and replace with:
```typescript
const userId = (req as any).user?.userId;
const conversations = await db.listConversations(userId);
```

Find `await db.createConversation(...)` calls and add `userId` argument where present in the chat route.

In `apps/server/src/routes/chat.ts`, find the `db.createConversation` call:
```typescript
currentConversationId = await db.createConversation(lastUserMessage.slice(0, 30), model);
```
Replace with:
```typescript
const userId = (req as any).user?.userId;
currentConversationId = await db.createConversation(lastUserMessage.slice(0, 30), model, userId);
```

- [ ] **Step 4: Verify server starts and auth works**

```bash
pnpm dev
```

Test register:
```bash
curl -s -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}' | jq .
```

Expected:
```json
{"token": "eyJ...", "user": {"id": "uuid", "email": "test@example.com"}}
```

Test protected route without token:
```bash
curl -s http://localhost:4000/conversations | jq .
```

Expected: `{"error": "authorization required"}`

Test with token:
```bash
TOKEN="paste-token-here"
curl -s http://localhost:4000/conversations \
  -H "Authorization: Bearer $TOKEN" | jq .
```

Expected: `[]` (empty array, no error).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/server.ts apps/server/src/routes/conversations.ts apps/server/src/routes/chat.ts
git commit -m "feat: register auth routes, add JWT preHandler hook, scope conversations by userId"
```

---

## Task 6: Agent sandbox DB setup

**Files:**
- Create: `scripts/setup-agent-sandbox.sql`
- Modify: `packages/tools/db-tools.ts`

- [ ] **Step 1: Write `scripts/setup-agent-sandbox.sql`**

```sql
-- Run with: psql -v AGENT_SANDBOX_PASSWORD="<secret>" -f scripts/setup-agent-sandbox.sql $DATABASE_URL

CREATE SCHEMA IF NOT EXISTS agent_sandbox;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_sandbox_role') THEN
    CREATE ROLE agent_sandbox_role NOLOGIN;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA agent_sandbox TO agent_sandbox_role;
GRANT SELECT, INSERT, UPDATE, CREATE ON ALL TABLES IN SCHEMA agent_sandbox TO agent_sandbox_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA agent_sandbox
  GRANT SELECT, INSERT, UPDATE ON TABLES TO agent_sandbox_role;
REVOKE ALL ON SCHEMA public FROM agent_sandbox_role;

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'agent_sandbox_user') THEN
    EXECUTE format('CREATE USER agent_sandbox_user WITH PASSWORD %L', :'AGENT_SANDBOX_PASSWORD');
  END IF;
END
$$;

GRANT agent_sandbox_role TO agent_sandbox_user;

\echo 'Agent sandbox schema and user created successfully.'
```

- [ ] **Step 2: Run the setup script**

```bash
export AGENT_SANDBOX_PASSWORD="choose-a-strong-password"
psql -v AGENT_SANDBOX_PASSWORD="$AGENT_SANDBOX_PASSWORD" \
  -f scripts/setup-agent-sandbox.sql \
  ${DATABASE_URL:-postgresql://postgres:postgres@localhost:5432/ai_workspace}
```

Expected: `Agent sandbox schema and user created successfully.`

- [ ] **Step 3: Set env var and update `packages/tools/db-tools.ts`**

Add `AGENT_SANDBOX_DB_URL` to your `.env` or shell:
```bash
export AGENT_SANDBOX_DB_URL="postgresql://agent_sandbox_user:$AGENT_SANDBOX_PASSWORD@localhost:5432/ai_workspace?search_path=agent_sandbox"
```

In `packages/tools/db-tools.ts`, update `createPool`:

```typescript
function createPool(): Pool {
  return new Pool({
    connectionString: process.env.AGENT_SANDBOX_DB_URL || process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ai_workspace',
  });
}
```

Also update `DescribeSchemaTool.execute` to scope to `agent_sandbox`:

```typescript
async execute(_args: Record<string, unknown>): Promise<string> {
  try {
    const schema = process.env.AGENT_SANDBOX_DB_URL ? 'agent_sandbox' : 'public';
    const result = await this.pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = $1
      ORDER BY table_name, ordinal_position
    `, [schema]);
    const tables: Record<string, string[]> = {};
    for (const row of result.rows) {
      if (!tables[row.table_name]) tables[row.table_name] = [];
      tables[row.table_name].push(`${row.column_name} (${row.data_type})`);
    }
    if (Object.keys(tables).length === 0) return `No tables found in schema "${schema}".`;
    return Object.entries(tables)
      .map(([t, cols]) => `${t}:\n  ${cols.join('\n  ')}`)
      .join('\n\n');
  } catch (e) {
    return `Schema error: ${(e as Error).message}`;
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add scripts/setup-agent-sandbox.sql packages/tools/db-tools.ts
git commit -m "feat: add agent sandbox SQL setup script and update db-tools to use scoped pool"
```

---

## Task 7: Frontend auth store

**Files:**
- Create: `apps/web/src/stores/useAuthStore.ts`

- [ ] **Step 1: Install zustand**

```bash
cd apps/web && pnpm add zustand
```

- [ ] **Step 2: Write `apps/web/src/stores/useAuthStore.ts`**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthUser {
  id: string;
  email: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const API_BASE = '/api';

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,

      login: async (email, password) => {
        const res = await fetch(`${API_BASE}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Login failed');
        set({ token: data.token, user: data.user });
      },

      register: async (email, password) => {
        const res = await fetch(`${API_BASE}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Registration failed');
        set({ token: data.token, user: data.user });
      },

      logout: () => set({ token: null, user: null }),
    }),
    { name: 'auth-storage', partialize: (s) => ({ token: s.token, user: s.user }) }
  )
);
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/stores/useAuthStore.ts apps/web/package.json
git commit -m "feat: add useAuthStore with zustand persist for JWT token management"
```

---

## Task 8: Login and Register pages

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`
- Create: `apps/web/src/pages/RegisterPage.tsx`

- [ ] **Step 1: Write `apps/web/src/pages/LoginPage.tsx`**

```tsx
import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

interface Props {
  onSuccess: () => void;
  onSwitchToRegister: () => void;
}

export default function LoginPage({ onSuccess, onSwitchToRegister }: Props) {
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl shadow-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Sign in</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
          No account?{' '}
          <button onClick={onSwitchToRegister} className="underline" style={{ color: 'var(--accent)' }}>
            Register
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Write `apps/web/src/pages/RegisterPage.tsx`**

```tsx
import { useState, FormEvent } from 'react';
import { useAuthStore } from '../stores/useAuthStore';

interface Props {
  onSuccess: () => void;
  onSwitchToLogin: () => void;
}

export default function RegisterPage({ onSuccess, onSwitchToLogin }: Props) {
  const { register } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setLoading(true);
    try {
      await register(email, password);
      onSuccess();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl shadow-xl" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--text-primary)' }}>Create account</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-muted)' }}>Password (min 8 chars)</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border-default)', color: 'var(--text-primary)' }}
            />
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity"
            style={{ background: 'var(--accent)', color: '#fff', opacity: loading ? 0.6 : 1 }}
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="text-xs text-center mt-4" style={{ color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <button onClick={onSwitchToLogin} className="underline" style={{ color: 'var(--accent)' }}>
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/
git commit -m "feat: add LoginPage and RegisterPage components"
```

---

## Task 9: Protected route and app routing

**Files:**
- Create: `apps/web/src/components/ProtectedRoute.tsx`
- Modify: `apps/web/src/App.tsx`

- [ ] **Step 1: Write `apps/web/src/components/ProtectedRoute.tsx`**

```tsx
import { useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import LoginPage from '../pages/LoginPage';
import RegisterPage from '../pages/RegisterPage';

interface Props {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: Props) {
  const { token } = useAuthStore();
  const [showRegister, setShowRegister] = useState(false);

  if (!token) {
    if (showRegister) {
      return <RegisterPage onSuccess={() => {}} onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onSuccess={() => {}} onSwitchToRegister={() => setShowRegister(true)} />;
  }

  return <>{children}</>;
}
```

- [ ] **Step 2: Wrap the app root in `apps/web/src/App.tsx`**

Find the existing root component (likely just renders `WorkspaceLayout`). Wrap it:

```tsx
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <ProtectedRoute>
      {/* existing layout */}
    </ProtectedRoute>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/ProtectedRoute.tsx apps/web/src/App.tsx
git commit -m "feat: add ProtectedRoute wrapper to gate workspace behind auth"
```

---

## Task 10: Attach auth token to all API/WS calls

**Files:**
- Modify: `apps/web/src/stores/useChatStore.tsx`
- Modify: `apps/web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Import auth store and attach token in `useChatStore.tsx`**

Find where the WebSocket connection is created (look for `new WebSocket(`). Update to append token as query param:

```typescript
import { useAuthStore } from './useAuthStore';

// Inside the sendMessage or connect function, get token:
const token = useAuthStore.getState().token;
const wsUrl = token
  ? `ws://localhost:4000/chat?token=${encodeURIComponent(token)}`
  : 'ws://localhost:4000/chat';
const ws = new WebSocket(wsUrl);
```

Find all `fetch('/api/...')` calls and add the Authorization header:

```typescript
const token = useAuthStore.getState().token;
const headers: Record<string, string> = { 'Content-Type': 'application/json' };
if (token) headers['Authorization'] = `Bearer ${token}`;
```

Apply the same pattern to the `/api/models` fetch, `/api/conversations` fetch, and `/api/kb/list` fetch.

- [ ] **Step 2: Add logout button to `apps/web/src/components/layout/Sidebar.tsx`**

Import `useAuthStore`:
```typescript
import { useAuthStore } from '../../stores/useAuthStore';
```

Add user info and logout button at the bottom of the sidebar (before the closing tag):

```tsx
const { user, logout } = useAuthStore();

// Add at bottom of sidebar JSX:
<div className="border-t px-3 py-3 flex items-center justify-between" style={{ borderColor: 'var(--border-subtle)' }}>
  <div className="truncate">
    <div className="text-xs font-medium truncate" style={{ color: 'var(--text-secondary)' }}>{user?.email}</div>
  </div>
  <button
    onClick={logout}
    className="text-xs px-2 py-1 rounded hover:bg-white/5 transition-colors flex-shrink-0"
    style={{ color: 'var(--text-muted)' }}
  >
    Sign out
  </button>
</div>
```

- [ ] **Step 3: Verify auth flow in browser**

```bash
pnpm dev
```

Open `http://localhost:5173`. Expected: login form appears. Register new account. Expected: workspace loads. Send a chat message. Expected: message succeeds. Refresh page. Expected: stays logged in (token persisted). Click "Sign out". Expected: login form appears again.

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/stores/useChatStore.tsx apps/web/src/components/layout/Sidebar.tsx
git commit -m "feat: attach JWT token to all WS and API calls, add logout to sidebar"
```

---

## Task 11: Run Phase 2 tests

- [ ] **Step 1: Run auth package tests**

```bash
cd packages/auth && pnpm test
```

Expected: PASS — 4 tests.

- [ ] **Step 2: Full integration smoke test**

Register two users. Send conversations as each. Verify conversations are isolated (user A cannot see user B's conversations via the API with their token).

```bash
# Register user A
TOKEN_A=$(curl -s -X POST http://localhost:4000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@test.com","password":"password123"}' | jq -r .token)

# Send a chat (via browser for WS), or directly test conversations endpoint
curl -s http://localhost:4000/conversations \
  -H "Authorization: Bearer $TOKEN_A" | jq length
```

Expected: user A sees 0 conversations initially.

- [ ] **Step 3: Tag Phase 2 complete**

```bash
git tag phase2-complete
```
