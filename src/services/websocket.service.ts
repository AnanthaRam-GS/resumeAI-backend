import type { FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import jwt, { type JwtPayload } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env.js';

type SocketLike = {
  send: (data: string) => void;
  close: () => void;
  readyState: number;
  on: (event: 'close' | 'error' | 'message', listener: (...args: unknown[]) => void) => void;
};

type WebSocketAuthRequest = {
  query?: unknown;
  headers: {
    authorization?: string;
  };
  url?: string;
};

const userSockets = new Map<string, Set<SocketLike>>();

const payloadSchema = z.object({
  userId: z.string().min(1),
  email: z.string().min(1),
});

const parseToken = (token: string | undefined): string | null => {
  if (!token) return null;
  try {
    const decoded = jwt.verify(token, env.JWT_SECRET) as string | JwtPayload;
    if (typeof decoded === 'string') return null;
    const parsed = payloadSchema.safeParse(decoded);
    return parsed.success ? parsed.data.userId : null;
  } catch {
    return null;
  }
};

const getStringProperty = (value: unknown, property: string): string | undefined => {
  if (typeof value !== 'object' || value === null || !(property in value)) {
    return undefined;
  }

  const propertyValue = value[property as keyof typeof value];
  return typeof propertyValue === 'string' ? propertyValue : undefined;
};

const getTokenFromUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;

  try {
    return new URL(url, 'http://localhost').searchParams.get('token') ?? undefined;
  } catch {
    return undefined;
  }
};

export const getWebSocketAuthToken = (request: WebSocketAuthRequest): string | undefined => {
  const queryToken = getStringProperty(request.query, 'token') ?? getTokenFromUrl(request.url);
  const authHeader = request.headers.authorization;
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.slice('Bearer '.length)
    : undefined;

  return queryToken ?? bearerToken;
};

const addSocket = (userId: string, socket: SocketLike): void => {
  const sockets = userSockets.get(userId) ?? new Set<SocketLike>();
  sockets.add(socket);
  userSockets.set(userId, sockets);

  socket.on('close', () => {
    sockets.delete(socket);
    if (sockets.size === 0) userSockets.delete(userId);
  });
  socket.on('error', () => {
    sockets.delete(socket);
    if (sockets.size === 0) userSockets.delete(userId);
  });
};

export const emitToUser = (userId: string, event: Record<string, unknown>): void => {
  const sockets = userSockets.get(userId);
  if (!sockets?.size) return;
  const payload = JSON.stringify(event);

  for (const socket of sockets) {
    try {
      if (socket.readyState === 1) socket.send(payload);
    } catch {
      sockets.delete(socket);
    }
  }
};

export const registerWebSocket = (app: FastifyInstance): void => {
  app.register(websocket);

  global.wsEmitToUser = emitToUser;

  app.get('/ws', { websocket: true }, (connection, request) => {
    const token = getWebSocketAuthToken(request);
    const userId = parseToken(token);

    if (!userId) {
      connection.close();
      return;
    }

    addSocket(userId, connection as unknown as SocketLike);
    connection.send(
      JSON.stringify({
        type: 'pipeline_progress',
        operationId: 'websocket',
        pipelineType: 'connection',
        stage: 'connected',
        status: 'completed',
        progress: 100,
        message: 'Realtime progress connected',
        timestamp: new Date().toISOString(),
      }),
    );

    connection.on('message', (raw: unknown) => {
      if (String(raw) === 'ping') {
        connection.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      }
    });
  });
};
