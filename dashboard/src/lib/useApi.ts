import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { ApiError, errorMessage } from '../api/client';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  errorStatus: number | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

export function useApi<T>(load: () => Promise<T>, deps: DependencyList): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    setErrorStatus(null);
    load().then(
      (result) => {
        if (id !== requestId.current) return;
        setData(result);
        setLoading(false);
      },
      (err: unknown) => {
        if (id !== requestId.current) return;
        setError(errorMessage(err));
        setErrorStatus(err instanceof ApiError ? err.status : null);
        setLoading(false);
      },
    );
    // Callers pass the deps that `load` closes over, like useEffect.
  }, [...deps, reloadKey]);

  const reload = useCallback(() => setReloadKey((k) => k + 1), []);
  return { data, error, errorStatus, loading, reload, setData };
}

export function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}
