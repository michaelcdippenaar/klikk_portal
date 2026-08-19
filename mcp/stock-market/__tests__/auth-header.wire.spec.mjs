/**
 * ADVERSARIAL wire-level test for the Klikk Financials MCP server outbound auth header.
 *
 * Claim under test:
 *   mcp/stock-market/server.mjs sends `Authorization: Bearer ${KLIKK_API_TOKEN}` to the
 *   Klikk backend when the env var is set, and sends NO Authorization header when it is not.
 *
 * This test deliberately does NOT read the source text and does NOT unit-test requestHeaders()
 * in isolation. It stands up a real stub HTTP server, spawns the real server.mjs process over
 * stdio, drives real JSON-RPC tools/call requests, and asserts on the bytes the stub received.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER_PATH = path.join(REPO_ROOT, 'mcp', 'stock-market', 'server.mjs');

const TOKEN = 'test-token-abc123';
const TEST_TIMEOUT = 30_000;
const RPC_TIMEOUT = 20_000;

/* ------------------------------------------------------------------ stub backend */

async function startStub() {
  const requests = [];

  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        rawHeaders: [...req.rawHeaders],
        body,
      });

      const payload =
        req.method === 'POST'
          ? {
              created: true,
              item: {
                code: 'ADV-TEST-001',
                name: 'Adversarial Test Item',
                category: 'test',
                unit: 'per day',
                active: true,
                current_price: null,
                current_price_valid_from: null,
              },
            }
          : {
              count: 1,
              categories: ['test'],
              items: [
                {
                  code: 'ADV-TEST-001',
                  name: 'Adversarial Test Item',
                  category: 'test',
                  unit: 'per day',
                  active: true,
                  current_price: '100.00',
                  current_price_valid_from: '2026-01-01',
                },
              ],
            };

      const text = JSON.stringify(payload);
      res.writeHead(200, {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(text),
      });
      res.end(text);
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address();

  return {
    requests,
    baseUrl: `http://127.0.0.1:${port}`,
    close() {
      server.closeAllConnections?.();
      server.close();
    },
  };
}

/* ------------------------------------------------------------------ mcp child */

function childEnv(baseUrl, token) {
  const env = { ...process.env };
  // Never let the runner's own environment decide the outcome of this test.
  delete env.KLIKK_API_TOKEN;
  // Do not inherit vitest's loader/coverage hooks into a plain node child.
  delete env.NODE_OPTIONS;
  delete env.NODE_V8_COVERAGE;

  env.KLIKK_API_BASE_URL = baseUrl;
  env.KLIKK_MCP_TRANSPORT = 'stdio';
  if (token !== undefined) env.KLIKK_API_TOKEN = token;
  return env;
}

function startMcp(env) {
  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: REPO_ROOT,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  const pending = new Map();
  const stdoutLines = [];
  let stdoutBuffer = '';
  let stderrText = '';
  let exited = null;

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk;
    const parts = stdoutBuffer.split('\n');
    stdoutBuffer = parts.pop() ?? '';
    for (const raw of parts) {
      const line = raw.trim();
      if (!line) continue;
      stdoutLines.push(line);
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue; // tolerate any banner / log noise on stdout
      }
      if (message && message.id !== undefined && pending.has(message.id)) {
        const entry = pending.get(message.id);
        pending.delete(message.id);
        entry.resolve(message);
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => {
    stderrText += chunk;
  });

  const rejectAll = (error) => {
    for (const entry of pending.values()) entry.reject(error);
    pending.clear();
  };

  child.on('exit', (code, signal) => {
    exited = { code, signal };
    rejectAll(new Error(`MCP server exited early (code=${code}, signal=${signal}). stderr:\n${stderrText}`));
  });
  child.on('error', rejectAll);

  let nextId = 0;

  function request(method, params) {
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      if (exited) {
        reject(new Error(`MCP server already exited (${JSON.stringify(exited)}). stderr:\n${stderrText}`));
        return;
      }
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(
          new Error(
            `Timed out after ${RPC_TIMEOUT}ms waiting for ${method} (id=${id}).\n` +
              `stdout lines seen: ${JSON.stringify(stdoutLines)}\nstderr:\n${stderrText}`,
          ),
        );
      }, RPC_TIMEOUT);

      pending.set(id, {
        resolve: (message) => {
          clearTimeout(timer);
          resolve(message);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });

      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
  }

  return {
    child,
    request,
    get stderr() {
      return stderrText;
    },
    get stdoutLines() {
      return stdoutLines.slice();
    },
    kill() {
      try {
        child.stdin.end();
      } catch {
        /* already gone */
      }
      if (!child.killed) child.kill('SIGKILL');
    },
  };
}

/* ------------------------------------------------------------------ harness */

const cleanups = [];

afterEach(async () => {
  while (cleanups.length) {
    const fn = cleanups.pop();
    try {
      await fn();
    } catch {
      /* best effort */
    }
  }
});

async function harness(token) {
  const stub = await startStub();
  cleanups.push(() => stub.close());

  const mcp = startMcp(childEnv(stub.baseUrl, token));
  cleanups.push(() => mcp.kill());

  const init = await mcp.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'adversarial-auth-header-test', version: '0.0.0' },
  });
  expect(init.result?.serverInfo?.name).toBe('klikk-financials');

  return { stub, mcp };
}

function callUpsert(mcp) {
  return mcp.request('tools/call', {
    name: 'pricelist_upsert_item',
    arguments: {
      code: 'ADV-TEST-001',
      name: 'Adversarial Test Item',
      category: 'test',
      unit: 'per day',
      confirm: true,
    },
  });
}

function callListItems(mcp) {
  return mcp.request('tools/call', {
    name: 'pricelist_list_items',
    arguments: { q: 'ADV-TEST' },
  });
}

function toolText(response) {
  expect(response.error, `JSON-RPC error: ${JSON.stringify(response.error)}`).toBeUndefined();
  expect(response.result?.content?.[0]?.text).toBeTypeOf('string');
  return response.result.content.map((part) => part.text).join('\n');
}

function expectSucceeded(response) {
  const text = toolText(response);
  expect(response.result.isError, `tool reported an error: ${text}`).toBe(false);
  return text;
}

function writeRequest(stub) {
  const found = stub.requests.filter(
    (r) => r.method === 'POST' && r.url.split('?')[0] === '/api/pricelist/items/',
  );
  expect(
    found.length,
    `expected exactly one POST /api/pricelist/items/ on the wire, got ${found.length}. ` +
      `All recorded: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
  ).toBe(1);
  return found[0];
}

function readRequest(stub) {
  const found = stub.requests.filter(
    (r) => r.method === 'GET' && r.url.split('?')[0] === '/api/pricelist/items/',
  );
  expect(found.length, `expected exactly one GET /api/pricelist/items/, got ${found.length}`).toBe(1);
  return found[0];
}

/** Count Authorization-ish headers as they arrived on the wire, case-insensitively. */
function rawAuthHeaders(recorded) {
  const out = [];
  for (let i = 0; i < recorded.rawHeaders.length; i += 2) {
    if (/^authorization$/i.test(recorded.rawHeaders[i])) {
      out.push([recorded.rawHeaders[i], recorded.rawHeaders[i + 1]]);
    }
  }
  return out;
}

/** No request, ever, may carry a phantom bearer. */
function expectNoPhantomBearer(stub) {
  for (const recorded of stub.requests) {
    for (const [, value] of rawAuthHeaders(recorded)) {
      expect(
        value,
        `phantom Authorization header on ${recorded.method} ${recorded.url}: ${JSON.stringify(value)}`,
      ).not.toMatch(/^Bearer\s*(undefined|null|NaN)?\s*$/i);
    }
  }
}

/* ------------------------------------------------------------------ tests */

describe('MCP server outbound Authorization header (wire-level)', () => {
  it(
    'sends Bearer <token> on the MUTATING pricelist_upsert_item POST when KLIKK_API_TOKEN is set',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const response = await callUpsert(mcp);
      expectSucceeded(response);

      const write = writeRequest(stub);
      expect(write.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(rawAuthHeaders(write)).toHaveLength(1);
      expectNoPhantomBearer(stub);

      // Prove this really is the write call and the body made it through.
      const body = JSON.parse(write.body);
      expect(body).toMatchObject({ code: 'ADV-TEST-001', name: 'Adversarial Test Item', set_by: 'claude-mcp' });
      expect(write.headers['content-type']).toBe('application/json');
      expect(write.headers.accept).toBe('application/json');
    },
    TEST_TIMEOUT,
  );

  it(
    'sends Bearer <token> on the READ pricelist_list_items GET too, not just the write',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const response = await callListItems(mcp);
      expectSucceeded(response);

      const read = readRequest(stub);
      expect(read.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(rawAuthHeaders(read)).toHaveLength(1);
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'sends the header on BOTH calls from a single long-lived server process',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      expectSucceeded(await callListItems(mcp));
      expectSucceeded(await callUpsert(mcp));

      expect(stub.requests.length).toBeGreaterThanOrEqual(2);
      for (const recorded of stub.requests) {
        expect(
          recorded.headers.authorization,
          `missing/incorrect auth on ${recorded.method} ${recorded.url}`,
        ).toBe(`Bearer ${TOKEN}`);
      }
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'sends NO Authorization header at all when KLIKK_API_TOKEN is absent from the environment',
    async () => {
      const { stub, mcp } = await harness(undefined);

      expectSucceeded(await callUpsert(mcp));

      const write = writeRequest(stub);
      expect(write.headers.authorization).toBeUndefined();
      expect(rawAuthHeaders(write)).toHaveLength(0);
      // The silent-failure mode worth catching: a constant-time compare on the backend
      // will happily receive "Bearer undefined" and just deny — looking like a config bug.
      expect(JSON.stringify(write.headers)).not.toMatch(/bearer/i);
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'sends NO Authorization header when KLIKK_API_TOKEN is set but empty',
    async () => {
      const { stub, mcp } = await harness('');

      expectSucceeded(await callUpsert(mcp));
      expectSucceeded(await callListItems(mcp));

      expect(stub.requests.length).toBeGreaterThanOrEqual(2);
      for (const recorded of stub.requests) {
        expect(
          recorded.headers.authorization,
          `unexpected auth header on ${recorded.method} ${recorded.url}`,
        ).toBeUndefined();
        expect(rawAuthHeaders(recorded)).toHaveLength(0);
      }
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'still sends the header for the string "0" — truthiness must not swallow a real token',
    async () => {
      // "0" is a JS-falsy-looking string that is actually truthy — assert we do NOT
      // silently drop a real (if odd) token. This pins the exact truthiness semantics.
      const { stub, mcp } = await harness('0');

      expectSucceeded(await callUpsert(mcp));

      const write = writeRequest(stub);
      expect(write.headers.authorization).toBe('Bearer 0');
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'transmits the token value byte-exact, not trimmed / re-encoded / re-cased',
    async () => {
      const gnarly = 'Tk_9f8A.b-C~d+e/f=g 123';
      const { stub, mcp } = await harness(gnarly);

      expectSucceeded(await callUpsert(mcp));

      const write = writeRequest(stub);
      expect(write.headers.authorization).toBe(`Bearer ${gnarly}`);
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );

  it(
    'does not leak the token into the tool result payload or into stderr',
    async () => {
      const { mcp } = await harness(TOKEN);

      const writeText = expectSucceeded(await callUpsert(mcp));
      const readText = expectSucceeded(await callListItems(mcp));

      expect(writeText).not.toContain(TOKEN);
      expect(readText).not.toContain(TOKEN);
      expect(mcp.stdoutLines.join('\n')).not.toContain(TOKEN);
      expect(mcp.stderr).not.toContain(TOKEN);
    },
    TEST_TIMEOUT,
  );

  it(
    'does not leak the token when the backend rejects the call (error path)',
    async () => {
      const stub = await startStub();
      cleanups.push(() => stub.close());

      // Replace the stub behaviour: fail every request with a 401 the way a real
      // token-guarded DRF backend would, so the error string is exercised.
      const failing = createServer((req, res) => {
        let body = '';
        req.on('data', (c) => {
          body += c;
        });
        req.on('end', () => {
          stub.requests.push({
            method: req.method,
            url: req.url,
            headers: { ...req.headers },
            rawHeaders: [...req.rawHeaders],
            body,
          });
          const text = JSON.stringify({ detail: 'Invalid token.' });
          res.writeHead(401, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
          res.end(text);
        });
      });
      failing.listen(0, '127.0.0.1');
      await once(failing, 'listening');
      cleanups.push(() => {
        failing.closeAllConnections?.();
        failing.close();
      });
      const failingUrl = `http://127.0.0.1:${failing.address().port}`;

      const mcp = startMcp(childEnv(failingUrl, TOKEN));
      cleanups.push(() => mcp.kill());
      await mcp.request('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'adversarial-auth-header-test', version: '0.0.0' },
      });

      const response = await callUpsert(mcp);
      const text = toolText(response);
      expect(response.result.isError).toBe(true);
      expect(text).toContain('401');
      expect(text).not.toContain(TOKEN);
      expect(mcp.stderr).not.toContain(TOKEN);

      // The header still went out on the failing call.
      const write = stub.requests.find((r) => r.method === 'POST');
      expect(write, 'no POST reached the failing stub').toBeTruthy();
      expect(write.headers.authorization).toBe(`Bearer ${TOKEN}`);
    },
    TEST_TIMEOUT,
  );
});
