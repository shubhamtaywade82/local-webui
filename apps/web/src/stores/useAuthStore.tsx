import React, { createContext, useContext, useState, useCallback } from 'react';

interface AuthState {
  token: string | null;
  userId: string | null;
  email: string | null;
}

interface AuthContextValue {
  auth: AuthState;
  login: (email: string, password: string) => Promise<string | null>;
  register: (email: string, password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuthStore(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuthStore must be used within AuthProvider');
  return ctx;
}

function loadAuth(): AuthState {
  try {
    const raw = localStorage.getItem('ai-workspace-auth');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { token: null, userId: null, email: null };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuth);

  const persist = (state: AuthState) => {
    localStorage.setItem('ai-workspace-auth', JSON.stringify(state));
    setAuth(state);
  };

  const login = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return (data as any).error ?? 'Login failed';
    }
    const data = await res.json();
    persist({ token: data.token, userId: data.userId, email: data.email });
    return null;
  }, []);

  const register = useCallback(async (email: string, password: string): Promise<string | null> => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return (data as any).error ?? 'Registration failed';
    }
    const data = await res.json();
    persist({ token: data.token, userId: data.userId, email: data.email });
    return null;
  }, []);

  const logout = useCallback(() => {
    persist({ token: null, userId: null, email: null });
  }, []);

  return (
    <AuthContext.Provider value={{ auth, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
