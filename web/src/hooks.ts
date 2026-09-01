import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { StreamEvent } from '@cloudbrain/shared';

export function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState<string>(() => {
    const saved = localStorage.getItem('cb-theme');
    if (saved === 'light' || saved === 'dark') return saved;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
    localStorage.setItem('cb-theme', theme);
  }, [theme]);
  return [theme, () => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))];
}

export interface Toast {
  id: number;
  kind: 'info' | 'error' | 'success';
  message: string;
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const push = useCallback((kind: Toast['kind'], message: string) => {
    const id = nextId.current++;
    setToasts((t) => [...t, { id, kind, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5000);
  }, []);
  return { toasts, push };
}

/**
 * Realtime stream — per-user WebSocket to the RealtimeHub Durable Object.
 * Reconnects with backoff; consumers subscribe to event types they care about.
 */
export function useRealtime(enabled: boolean, onEvent: (event: StreamEvent) => void): void {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws`);
      ws.onopen = () => {
        attempt = 0;
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== 'string' || e.data === 'pong') return;
        try {
          handlerRef.current(JSON.parse(e.data) as StreamEvent);
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (closed) return;
        attempt += 1;
        timer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 15000));
      };
      ws.onerror = () => ws?.close();
    };
    connect();

    const keepAlive = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send('ping');
    }, 30000);

    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      clearInterval(keepAlive);
      ws?.close();
    };
  }, [enabled]);
}

/** Simple hash-based router (no dependencies). */
export function useHashRoute(): [string, (to: string) => void] {
  const [route, setRoute] = useState(() => window.location.hash.replace(/^#/, '') || '/chat');
  useEffect(() => {
    const onHash = () => setRoute(window.location.hash.replace(/^#/, '') || '/chat');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const navigate = useCallback((to: string) => {
    window.location.hash = to;
  }, []);
  return [route, navigate];
}
