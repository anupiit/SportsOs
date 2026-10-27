'use client';

import type { ReactNode } from 'react';
import { SWRConfig } from 'swr';
import { ApiError } from '@/lib/api';
import { AuthProvider } from './auth';
import { ToastProvider } from './toast';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: true,
        keepPreviousData: true,
        shouldRetryOnError: (err) => !(err instanceof ApiError) || err.status >= 500 || err.status === 0,
        errorRetryCount: 2,
      }}
    >
      <ToastProvider>
        <AuthProvider>{children}</AuthProvider>
      </ToastProvider>
    </SWRConfig>
  );
}
