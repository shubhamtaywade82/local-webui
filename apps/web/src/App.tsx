import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ChatStoreProvider } from './stores/useChatStore';
import { EditorStoreProvider } from './stores/useEditorStore';
import { AuthProvider, useAuthStore } from './stores/useAuthStore';
import { SqlResultsProvider } from './stores/useSqlResultsStore';
import WorkspaceLayout from './components/layout/WorkspaceLayout';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';
import SimpleChatPage from './pages/SimpleChatPage';

function AppContent() {
  const { auth } = useAuthStore();
  const [showRegister, setShowRegister] = useState(false);

  if (!auth.token) {
    if (showRegister) {
      return <RegisterPage onSwitchToLogin={() => setShowRegister(false)} />;
    }
    return <LoginPage onSwitchToRegister={() => setShowRegister(true)} />;
  }

  return (
    <ChatStoreProvider>
      <EditorStoreProvider>
        <SqlResultsProvider>
          <WorkspaceLayout />
        </SqlResultsProvider>
      </EditorStoreProvider>
    </ChatStoreProvider>
  );
}

function SimpleChatRoute() {
  const { auth } = useAuthStore();
  if (!auth.token) {
    return <Navigate to="/" replace />;
  }
  return (
    <EditorStoreProvider>
      <SimpleChatPage />
    </EditorStoreProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter
        future={{
          v7_startTransition: true,
          v7_relativeSplatPath: true,
        }}
      >
        <Routes>
          <Route path="/chst" element={<SimpleChatRoute />} />
          <Route path="/*" element={<AppContent />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
