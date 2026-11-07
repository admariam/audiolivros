import { useCallback, useEffect, useRef, useState } from 'react';
import type { BookMeta, Preferences } from './types';
import { listBooks } from './lib/db';
import { createId } from './lib/ids';
import {
  defaultPreferences,
  loadPreferences,
  savePreferences,
} from './lib/preferences';

import { useVoices } from './hooks/useVoices';
import { Library } from './components/Library';
import { Reader } from './components/Reader';
import { ToastStack, type ToastMessage, type ToastTone } from './components/Toasts';
import { LockScreen } from './components/LockScreen';
import { isUnlocked } from './lib/gate';

type Route =
  | { name: 'library' }
  | { name: 'reader'; bookId: string; startPage?: number; key: string };

function friendlyLoadError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `${error.message} Se você estiver em uma janela privada, o armazenamento local pode estar bloqueado.`;
  }
  return 'O armazenamento local do navegador não pôde ser acessado. Verifique se o IndexedDB está habilitado e tente novamente.';
}

export default function App() {
  const [preferences, setPreferences] = useState<Preferences>(() => loadPreferences());
  const [books, setBooks] = useState<BookMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [route, setRoute] = useState<Route>({ name: 'library' });
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [unlocked, setUnlocked] = useState(() => isUnlocked());
  const voices = useVoices();

  const notify = useCallback((message: string, tone: ToastTone = 'info') => {
    setToasts((current) => [...current.slice(-3), { id: createId(), message, tone }]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const firstLoadRef = useRef(true);

  const refreshBooks = useCallback(async () => {
    if (firstLoadRef.current) setLoading(true);
    try {
      const loaded = await listBooks();
      setBooks(loaded);
      setLoadError(null);
    } catch (error) {
      setLoadError(friendlyLoadError(error));
    } finally {
      firstLoadRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshBooks();
  }, [refreshBooks]);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.style.colorScheme = preferences.theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    // A cor vem do CSS (--theme-color): uma fonte de verdade só.
    const themed = getComputedStyle(root).getPropertyValue('--theme-color').trim();
    if (meta && themed) meta.setAttribute('content', themed);
  }, [preferences.theme]);

  const updatePreferences = useCallback((patch: Partial<Preferences>) => {
    setPreferences((current) => {
      const next = { ...current, ...patch };
      savePreferences(next);
      return next;
    });
  }, []);

  const openBook = useCallback(
    (bookId: string, startPage?: number) => {
      updatePreferences({ lastBookId: bookId });
      setRoute({ name: 'reader', bookId, startPage, key: createId() });
    },
    [updatePreferences],
  );

  const backToLibrary = useCallback(() => {
    setRoute({ name: 'library' });
    void refreshBooks();
  }, [refreshBooks]);

  const handleDataCleared = useCallback(() => {
    setPreferences({ ...defaultPreferences });
    savePreferences({ ...defaultPreferences });
    setRoute({ name: 'library' });
    void refreshBooks();
  }, [refreshBooks]);

  if (!unlocked) {
    return (
      <div className="app-shell">
        <LockScreen onUnlock={() => setUnlocked(true)} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Ir para o conteúdo principal
      </a>

      {route.name === 'reader' ? (
        <Reader
          key={route.key}
          bookId={route.bookId}
          startPage={route.startPage}
          preferences={preferences}
          voices={voices}
          onPreferencesChange={updatePreferences}
          onBack={backToLibrary}
          notify={notify}
        />
      ) : (
        <Library
          books={books}
          loading={loading}
          loadError={loadError}
          preferences={preferences}
          onPreferencesChange={updatePreferences}
          onOpenBook={openBook}
          onBooksChanged={refreshBooks}
          onDataCleared={handleDataCleared}
          notify={notify}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
