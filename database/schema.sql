CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY,
  title TEXT,
  model TEXT,
  user_id UUID REFERENCES users(id),
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE messages (
  id UUID PRIMARY KEY,
  conversation_id UUID REFERENCES conversations(id),
  role TEXT,
  content TEXT,
  token_count INT,
  created_at TIMESTAMP DEFAULT now()
);

CREATE TABLE summaries (
  conversation_id UUID PRIMARY KEY,
  summary TEXT,
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE tools (
  name TEXT PRIMARY KEY,
  description TEXT,
  schema JSONB
);

CREATE TABLE knowledge_files (
  path TEXT PRIMARY KEY,
  title TEXT,
  hash TEXT,
  updated_at TIMESTAMP
);