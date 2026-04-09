import React, { createContext, useContext, useEffect, useState } from 'react';

const MERGE_ERROR_PREFIX = 'merge-error:';

function loadMergeError(attemptId: string): string | null {
  try {
    return localStorage.getItem(`${MERGE_ERROR_PREFIX}${attemptId}`);
  } catch {
    return null;
  }
}

function saveMergeError(attemptId: string, error: string | null) {
  try {
    const key = `${MERGE_ERROR_PREFIX}${attemptId}`;
    if (error) {
      localStorage.setItem(key, error);
    } else {
      localStorage.removeItem(key);
    }
  } catch {
    // localStorage unavailable — silently degrade
  }
}

type GitOperationsContextType = {
  error: string | null;
  mergeError: string | null;
  setError: (error: string | null) => void;
  setMergeError: (error: string | null) => void;
};

const GitOperationsContext = createContext<GitOperationsContextType | null>(
  null
);

export const GitOperationsProvider: React.FC<{
  attemptId: string | undefined;
  children: React.ReactNode;
}> = ({ attemptId, children }) => {
  const [error, setError] = useState<string | null>(null);
  const [mergeError, setMergeErrorState] = useState<string | null>(() =>
    attemptId ? loadMergeError(attemptId) : null
  );

  useEffect(() => {
    setError(null);
    setMergeErrorState(attemptId ? loadMergeError(attemptId) : null);
  }, [attemptId]);

  const setMergeError = (msg: string | null) => {
    setMergeErrorState(msg);
    if (attemptId) saveMergeError(attemptId, msg);
  };

  return (
    <GitOperationsContext.Provider
      value={{ error, mergeError, setError, setMergeError }}
    >
      {children}
    </GitOperationsContext.Provider>
  );
};

export const useGitOperationsError = () => {
  const ctx = useContext(GitOperationsContext);
  if (!ctx) {
    throw new Error(
      'useGitOperationsError must be used within GitOperationsProvider'
    );
  }
  return ctx;
};
