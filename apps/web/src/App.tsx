import { ChatStoreProvider } from './stores/useChatStore';
import WorkspaceLayout from './components/layout/WorkspaceLayout';

export default function App() {
  return (
    <ChatStoreProvider>
      <WorkspaceLayout />
    </ChatStoreProvider>
  );
}