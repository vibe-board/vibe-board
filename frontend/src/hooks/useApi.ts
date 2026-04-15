import { useMemo } from 'react';
import { useConnection } from '@/contexts/ConnectionContext';
import {
  createApi,
  type MakeRequestFn,
  type UploadFormDataFn,
} from '@/lib/api';
import type { UnifiedConnection } from '@/lib/connections/types';

function makeBoundRequest(conn: UnifiedConnection): MakeRequestFn {
  return async (url, options = {}, extra?) => {
    const headers = new Headers(options.headers ?? {});
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    return conn.fetch(url, { ...options, headers }, extra);
  };
}

function makeBoundUpload(conn: UnifiedConnection): UploadFormDataFn {
  return async (url, formData) => {
    return conn.fetch(url, { method: 'POST', body: formData });
  };
}

export function useApi() {
  const conn = useConnection();
  return useMemo(
    () => createApi(makeBoundRequest(conn), makeBoundUpload(conn)),
    [conn]
  );
}
