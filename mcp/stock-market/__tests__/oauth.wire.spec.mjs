/**
 * Wire-level test for the OAuth 2.1 layer that makes this server a
 * claude.ai / Cowork-compatible custom connector.
 *
 * Claims under test, against a real spawned server.mjs over HTTP:
 *   1. Discovery: /.well-known/oauth-protected-resource[/mcp] and
 *      /.well-known/oauth-authorization-server[/mcp] describe the AS.
 *   2. An unauthenticated POST /mcp 401s with a WWW-Authenticate header
 *      pointing at the protected-resource metadata (the claude.ai entry point).
 *   3. The full flow works: register -> authorize (password form, PKCE) ->
 *      token -> authenticated tools/call, including the refresh_token grant.
 *   4. A wrong password 401s and never redeems a code; a wrong PKCE verifier
 *      fails the token exchange.
 *   5. The static KLIKK_MCP_AUTH_TOKEN keeps working alongside OAuth.
 *   6. GET /mcp answers 405 (no SSE stream), not 404.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER_PATH = path.join(REPO_ROOT, 'mcp', 'stock-market', 'server.mjs');

const STATIC_TOKEN = 'static-token-for-tests';
const PASSWORD = 'correct-horse-battery';
const JWT_SECRET = 'x'.repeat(48);
const TEST_TIMEOUT = 30_000;

let child;
let baseUrl;
let publicUrl;
let stub;

async function startStubBackend() {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, path: req.url }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return server;
}

beforeAll(async () => {
  stub = await startStubBackend();
  const port = 18000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  publicUrl = baseUrl; // in production this is https://console.8-bit.space
  child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      KLIKK_MCP_TRANSPORT: 'http',
      KLIKK_MCP_HTTP_HOST: '127.0.0.1',
      KLIKK_MCP_HTTP_PORT: String(port),
      KLIKK_MCP_AUTH_TOKEN: STATIC_TOKEN,
      KLIKK_MCP_PUBLIC_URL: publicUrl,
      KLIKK_MCP_OAUTH_PASSWORD: PASSWORD,
      KLIKK_MCP_JWT_SECRET: JWT_SECRET,
      KLIKK_API_BASE_URL: `http://127.0.0.1:${stub.address().port}`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  // Wait for the listening banner on stderr.
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10_000);
    child.stderr.on('data', (chunk) => {
      if (String(chunk).includes('listening')) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
  });
}, TEST_TIMEOUT);

afterAll(() => {
  child?.kill();
  stub?.close();
});

async function runAuthFlow({ verifierForToken } = {}) {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  const redirectUri = 'https://claude.ai/api/mcp/auth_callback';

  const reg = await fetch(`${baseUrl}/mcp/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ redirect_uris: [redirectUri] }),
  });
  expect(reg.status).toBe(201);
  const { client_id: clientId } = await reg.json();
  expect(clientId).toMatch(/^c_/);

  const authorizeUrl = new URL(`${baseUrl}/mcp/authorize`);
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('response_type', 'code');
  authorizeUrl.searchParams.set('state', 'st4te');
  authorizeUrl.searchParams.set('code_challenge', challenge);
  authorizeUrl.searchParams.set('code_challenge_method', 'S256');
  const page = await fetch(authorizeUrl);
  expect(page.status).toBe(200);
  const html = await page.text();
  const stateBlob = html.match(/name=s value="([^"]+)"/)?.[1];
  expect(stateBlob).toBeTruthy();

  const submit = await fetch(`${baseUrl}/mcp/authorize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ password: PASSWORD, s: stateBlob }),
    redirect: 'manual',
  });
  expect(submit.status).toBe(302);
  const location = new URL(submit.headers.get('location'));
  expect(location.origin + location.pathname).toBe(redirectUri);
  expect(location.searchParams.get('state')).toBe('st4te');
  const code = location.searchParams.get('code');
  expect(code).toBeTruthy();

  return fetch(`${baseUrl}/mcp/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifierForToken ?? verifier,
      client_id: clientId,
      redirect_uri: redirectUri,
    }),
  });
}

async function mcpCall(token, body) {
  return fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
}

describe('oauth connector layer', () => {
  it('serves discovery metadata at both well-known variants', async () => {
    for (const suffix of ['', '/mcp']) {
      const prm = await (await fetch(`${baseUrl}/.well-known/oauth-protected-resource${suffix}`)).json();
      expect(prm.resource).toBe(`${publicUrl}/mcp`);
      expect(prm.authorization_servers).toEqual([publicUrl]);
      const as = await (await fetch(`${baseUrl}/.well-known/oauth-authorization-server${suffix}`)).json();
      expect(as.issuer).toBe(publicUrl);
      expect(as.token_endpoint).toBe(`${publicUrl}/mcp/token`);
      expect(as.code_challenge_methods_supported).toEqual(['S256']);
    }
  });

  it('401s unauthenticated /mcp with a resource_metadata challenge', async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    });
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toContain('/.well-known/oauth-protected-resource/mcp');
  });

  it('answers GET /mcp with 405, not 404', async () => {
    const res = await fetch(`${baseUrl}/mcp`);
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('POST');
  });

  it(
    'completes register -> authorize -> token -> tools/list, and refreshes',
    async () => {
      const tokenRes = await runAuthFlow();
      expect(tokenRes.status).toBe(200);
      const grant = await tokenRes.json();
      expect(grant.token_type).toBe('Bearer');
      expect(grant.access_token).toBeTruthy();
      expect(grant.refresh_token).toBeTruthy();

      const list = await mcpCall(grant.access_token, { jsonrpc: '2.0', id: 2, method: 'tools/list' });
      expect(list.status).toBe(200);
      const payload = await list.json();
      const names = payload.result.tools.map((t) => t.name);
      expect(names).toContain('slips_list');
      expect(names).toContain('slips_get');
      expect(names).toContain('investec_bank_search_transactions');

      const refreshed = await fetch(`${baseUrl}/mcp/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: grant.refresh_token }),
      });
      expect(refreshed.status).toBe(200);
      const refreshedGrant = await refreshed.json();
      const ping = await mcpCall(refreshedGrant.access_token, { jsonrpc: '2.0', id: 3, method: 'ping' });
      expect(ping.status).toBe(200);

      // A refresh token must not work as an access token.
      const misuse = await mcpCall(grant.refresh_token, { jsonrpc: '2.0', id: 4, method: 'ping' });
      expect(misuse.status).toBe(401);
    },
    TEST_TIMEOUT,
  );

  it('rejects a wrong PKCE verifier', async () => {
    const tokenRes = await runAuthFlow({ verifierForToken: 'wrong-verifier-entirely' });
    expect(tokenRes.status).toBe(400);
    const body = await tokenRes.json();
    expect(body.error).toBe('invalid_grant');
  });

  it('rejects a wrong password without issuing a code', async () => {
    const res = await fetch(`${baseUrl}/mcp/authorize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ password: 'not-the-password', s: 'irrelevant' }),
      redirect: 'manual',
    });
    expect(res.status).toBe(401);
  });

  it('keeps the static bearer token working alongside OAuth', async () => {
    const res = await mcpCall(STATIC_TOKEN, { jsonrpc: '2.0', id: 5, method: 'ping' });
    expect(res.status).toBe(200);
  });
});
