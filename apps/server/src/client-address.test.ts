// Client address for the per-address limits (S7-02): X-Real-IP from Caddy, else the socket.
import { describe, expect, it } from 'bun:test';
import { Hono } from 'hono';
import { clientAddress } from './client-address.ts';

const app = new Hono().get('/', (c) => c.text(clientAddress(c)));

/** Stand-in for the Bun server `getConnInfo` asks for the socket address. */
function socketFrom(address: string | null) {
  return {
    requestIP: () => (address === null ? null : { address, family: 'IPv4', port: 51_234 }),
  };
}

async function addressOf(headers: Record<string, string>, server?: object): Promise<string> {
  const res = await app.request('/', { headers }, server);
  return res.text();
}

describe('clientAddress', () => {
  it('prefers X-Real-IP over X-Forwarded-For and the socket', async () => {
    const headers = { 'x-real-ip': ' 198.51.100.4 ', 'x-forwarded-for': '203.0.113.9' };
    expect(await addressOf(headers, socketFrom('172.18.0.3'))).toBe('198.51.100.4');
  });

  it('ignores X-Forwarded-For and falls back to the socket address', async () => {
    const headers = { 'x-forwarded-for': '203.0.113.9, 198.51.100.4' };
    expect(await addressOf(headers, socketFrom('172.18.0.3'))).toBe('172.18.0.3');
  });

  it('treats a blank X-Real-IP as missing', async () => {
    expect(await addressOf({ 'x-real-ip': '  ' }, socketFrom('172.18.0.3'))).toBe('172.18.0.3');
  });

  it("is 'unknown' without a server or a socket address", async () => {
    expect(await addressOf({ 'x-forwarded-for': '203.0.113.9' })).toBe('unknown');
    expect(await addressOf({}, socketFrom(null))).toBe('unknown');
  });
});
