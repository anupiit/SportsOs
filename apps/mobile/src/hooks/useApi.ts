import { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { api, errorMessage } from '../api';

interface UseApiResult<T> {
  data: T | undefined;
  error: string | null;
  /** First load (no data yet). */
  loading: boolean;
  /** Pull-to-refresh in progress. */
  refreshing: boolean;
  refresh: () => Promise<void>;
  reload: () => Promise<void>;
  setData: (data: T | undefined) => void;
}

/**
 * GET `path` and keep the result. Re-fetches silently whenever the screen
 * regains focus, so lists stay fresh after actions on other screens.
 * Pass `null` to skip fetching.
 */
export function useApi<T>(path: string | null): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);
  const latest = useRef(0);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' | 'silent') => {
      if (path === null) return;
      const ticket = ++latest.current;
      if (mode === 'refresh') setRefreshing(true);
      try {
        const result = await api<T>(path);
        if (ticket !== latest.current) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (ticket !== latest.current) return;
        setError(errorMessage(err));
      } finally {
        if (ticket === latest.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    if (path === null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    void run('initial');
  }, [path, run]);

  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void run('silent');
    }, [run]),
  );

  const refresh = useCallback(() => run('refresh'), [run]);
  const reload = useCallback(() => run('silent'), [run]);

  return { data, error, loading, refreshing, refresh, reload, setData };
}
