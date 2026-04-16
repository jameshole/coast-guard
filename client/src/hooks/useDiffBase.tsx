import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface DiffBaseContextValue {
  baseRef: string;
  setBaseRef: (ref: string) => void;
  resetBaseRef: () => void;
}

const DEFAULT_BASE = 'HEAD';

const DiffBaseContext = createContext<DiffBaseContextValue | null>(null);

export function DiffBaseProvider({ children }: { children: ReactNode }) {
  const [baseRef, setBaseRefState] = useState<string>(DEFAULT_BASE);

  const setBaseRef = useCallback((ref: string) => {
    setBaseRefState(ref || DEFAULT_BASE);
  }, []);

  const resetBaseRef = useCallback(() => {
    setBaseRefState(DEFAULT_BASE);
  }, []);

  return (
    <DiffBaseContext.Provider value={{ baseRef, setBaseRef, resetBaseRef }}>
      {children}
    </DiffBaseContext.Provider>
  );
}

export function useDiffBase(): DiffBaseContextValue {
  const ctx = useContext(DiffBaseContext);
  if (!ctx) {
    throw new Error('useDiffBase must be used inside a DiffBaseProvider');
  }
  return ctx;
}
