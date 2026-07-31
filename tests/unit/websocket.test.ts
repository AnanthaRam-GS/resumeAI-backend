import { describe, expect, it } from 'vitest';
import { getWebSocketAuthToken } from '../../src/services/websocket.service.js';

describe('websocket auth token extraction', () => {
  it('uses the query token when Fastify provides a query object', () => {
    expect(
      getWebSocketAuthToken({
        query: { token: 'query-token' },
        headers: { authorization: 'Bearer bearer-token' },
        url: '/ws?token=url-token',
      }),
    ).toBe('query-token');
  });

  it('falls back to the request URL when the query object is missing', () => {
    expect(
      getWebSocketAuthToken({
        headers: {},
        url: '/ws?token=url-token',
      }),
    ).toBe('url-token');
  });

  it('falls back to a bearer token when no query token is present', () => {
    expect(
      getWebSocketAuthToken({
        headers: { authorization: 'Bearer bearer-token' },
        url: '/ws',
      }),
    ).toBe('bearer-token');
  });
});
