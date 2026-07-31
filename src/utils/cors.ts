import { env } from '../config/env.js';

export const parseAllowedOrigins = (rawOrigins: string | undefined): string[] => {
  if (!rawOrigins) {
    return ['http://localhost:5173', 'http://127.0.0.1:5173'];
  }

  const values = rawOrigins
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return values.length > 0 ? values : ['http://localhost:5173', 'http://127.0.0.1:5173'];
};

export const getCorsConfig = () => {
  const allowedOrigins = parseAllowedOrigins(env.CORS_ALLOWED_ORIGINS);

  return {
    origin: allowedOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  };
};
