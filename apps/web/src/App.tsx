import { ChatStoreProvider } from './stores/useChatStore';
import { EditorStoreProvider } from './stores/useEditorStore';
import WorkspaceLayout from './components/layout/WorkspaceLayout';

export default function App() {
  return (
    <ChatStoreProvider>
      <EditorStoreProvider>
        <WorkspaceLayout />
      </EditorStoreProvider>
    </ChatStoreProvider>
  );
}