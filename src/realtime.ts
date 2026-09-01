/**
 * RealtimeHub — Durable Object per user.
 *
 * Receives stream events from agent execution (via fetch from the Worker) and
 * pushes them to every connected browser tab over WebSockets. Uses hibernation
 * so idle sockets cost nothing.
 */

import type { StreamEvent } from '@cloudbrain/shared';

export class RealtimeHub implements DurableObject {
  private readonly state: DurableObjectState;
  private readonly env: Record<string, unknown>;

  constructor(state: DurableObjectState, env: Record<string, unknown>) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Browser connects here: GET /ws?token=… (validated by the Worker first).
    if (url.pathname === '/connect') {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    // Worker publishes here: POST /publish (JSON StreamEvent body).
    if (url.pathname === '/publish') {
      const event = (await request.json()) as StreamEvent;
      const payload = JSON.stringify(event);
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(payload);
        } catch {
          // socket is closing; hibernation API tolerates this
        }
      }
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
  }

  async webSocketMessage(_ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    // Client pings keep-alive; respond with pong.
    if (typeof message === 'string' && message === 'ping') {
      for (const sock of this.state.getWebSockets()) {
        if (sock === _ws) sock.send('pong');
      }
    }
  }

  async webSocketClose(_ws: WebSocket): Promise<void> {
    // Hibernation API cleans up automatically; nothing to persist.
  }
}
