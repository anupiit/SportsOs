'use client';

import useSWR, { mutate as globalMutate, type SWRConfiguration } from 'swr';
import { apiFetch, buildQuery, type Query } from './api';

type Key = readonly [string, string];

const fetcher = <T,>([path, qs]: Key) => apiFetch<T>(`${path}${qs}`);

/**
 * SWR-backed GET. Pass `null` as path to skip (e.g. while a dependency loads or
 * when the user lacks the permission for the endpoint).
 */
export function useApi<T>(path: string | null, query?: Query, config?: SWRConfiguration<T>) {
  const key: Key | null = path ? [path, buildQuery(query)] : null;
  return useSWR<T, Error, Key | null>(key, fetcher as (k: Key) => Promise<T>, config);
}

/** Revalidate every cached GET whose path starts with one of the prefixes. */
export function revalidate(...prefixes: string[]) {
  return globalMutate(
    (key) => Array.isArray(key) && typeof key[0] === 'string' && prefixes.some((p) => (key[0] as string).startsWith(p)),
  );
}
