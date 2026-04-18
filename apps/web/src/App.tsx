import { useState } from 'react';
import { ChatStoreProvider } from './stores/useChatStore';
import { EditorStoreProvider } from './stores/useEditorStore';
import { AuthProvider, useAuthStore } from './stores/useAuthStore';
import WorkspaceLayout from './components/layout/WorkspaceLayout';
import LoginPage from './components/auth/LoginPage';
import RegisterPage from './components/auth/RegisterPage';

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
        <WorkspaceLayout />
      </EditorStoreProvider>
    </ChatStoreProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
