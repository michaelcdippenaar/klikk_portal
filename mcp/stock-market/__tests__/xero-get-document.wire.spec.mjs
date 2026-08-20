/**
 * ADVERSARIAL wire-level test for the Klikk Financials MCP tool `xero_get_document`.
 *
 * Claim under test (contract, not the other agent's diff):
 *   - Read-only tool, no `confirm` required.
 *   - Params (all optional in schema, but at least ONE of invoice_number / amount / q /
 *     date_from / date_to is required at call time): invoice_number, amount, q, date_from,
 *     date_to, tenant_id, limit (default 20, max 100).
 *   - Issues exactly ONE outbound GET /xero/data/documents/search/ to the Klikk backend,
 *     carrying `Authorization: Bearer ${KLIKK_API_TOKEN}` when set, with filters + limit as
 *     query params.
 *   - Backend 200 shape: { count, limit, results: [ { id, file_name, content_type,
 *     invoice_number, contact_name, date, total, transaction_source, transaction_id,
 *     view_url } ] }.
 *   - Tool result: JSON containing at least count, limit, documents[] (retaining view_url),
 *     generated_at, api_base_url, agent_brief[].
 *   - No-filter call must return isError === true mentioning a filter is required, and must
 *     make NO outbound HTTP request.
 *
 * This test does NOT read the source of the change under test. It stands up a real stub HTTP
 * server, spawns the real server.mjs process over stdio, drives real JSON-RPC tools/call
 * requests, and asserts on the bytes the stub received.
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

const TOKEN = 'test-token-xero-doc-999';
const TEST_TIMEOUT = 30_000;
const RPC_TIMEOUT = 20_000;

const TOOL_NAME = 'xero_get_document';
const SEARCH_PATH = '/xero/data/documents/search/';

/* ------------------------------------------------------------------ realistic backend rows */

const ROW_INVOICE = {
  id: 481,
  file_name: 'DME Civil Progress Claim 3.pdf',
  content_type: 'application/pdf',
  invoice_number: 'INV-0263',
  contact_name: 'DME Civil Projects (Pty) Ltd',
  date: '2025-09-26',
  total: '256676.2300',
  transaction_source: 'Invoice',
  transaction_id: 'e84e164f-b8d6-486b-b54f-5635045387f9',
  view_url:
    'https://console.8-bit.space/backend/xero/data/documents/481/file/?s=0123456789abcdef0123456789abcdef',
};

const ROW_BANK_TXN_NULLS = {
  id: 19,
  file_name: 'JSE_Statement-JAN_2023 2074250.pdf',
  content_type: 'application/pdf',
  invoice_number: null,
  contact_name: null,
  date: null,
  total: null,
  transaction_source: 'BankTransaction',
  transaction_id: '1ff13858-c20e-4117-9632-294ab7f84686',
  view_url:
    'https://console.8-bit.space/backend/xero/data/documents/19/file/?s=fedcba9876543210fedcba9876543210',
};

/* ------------------------------------------------------------------ stub backend */

function makeStubServer(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      const recorded = {
        method: req.method,
        url: req.url,
        headers: { ...req.headers },
        rawHeaders: [...req.rawHeaders],
        body,
      };
      requests.push(recorded);
      handler(req, res, recorded);
    });
  });
  return { requests, server };
}

/** Default stub: any GET to the documents search endpoint returns two realistic rows.
 *  Any other path/tool call gets an empty-ish payload so it doesn't pollute assertions. */
async function startStub(customHandler) {
  const defaultHandler = (req, res, recorded) => {
    const urlPath = req.url.split('?')[0];
    if (req.method === 'GET' && urlPath === SEARCH_PATH) {
      const payload = { count: 2, limit: 20, results: [ROW_INVOICE, ROW_BANK_TXN_NULLS] };
      const text = JSON.stringify(payload);
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
      res.end(text);
      return;
    }
    // Anything unrelated to the tool under test: harmless empty envelope.
    const text = JSON.stringify({ count: 0, categories: [], items: [] });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
    res.end(text);
  };

  const { requests, server } = makeStubServer(customHandler || defaultHandler);
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
  delete env.KLIKK_API_TOKEN;
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

async function harness(token, customHandler) {
  const stub = await startStub(customHandler);
  cleanups.push(() => stub.close());

  const mcp = startMcp(childEnv(stub.baseUrl, token));
  cleanups.push(() => mcp.kill());

  const init = await mcp.request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'adversarial-xero-get-document-test', version: '0.0.0' },
  });
  expect(init.result?.serverInfo?.name).toBe('klikk-financials');

  return { stub, mcp };
}

function callTool(mcp, args) {
  return mcp.request('tools/call', { name: TOOL_NAME, arguments: args });
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

function expectFailed(response) {
  const text = toolText(response);
  expect(response.result.isError, `expected tool error but call succeeded: ${text}`).toBe(true);
  return text;
}

function searchRequests(stub) {
  return stub.requests.filter((r) => r.method === 'GET' && r.url.split('?')[0] === SEARCH_PATH);
}

function onlySearchRequest(stub) {
  const found = searchRequests(stub);
  expect(
    found.length,
    `expected exactly one GET ${SEARCH_PATH} on the wire, got ${found.length}. ` +
      `All recorded: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
  ).toBe(1);
  return found[0];
}

function queryParams(recorded) {
  const qs = recorded.url.split('?')[1] || '';
  return new URLSearchParams(qs);
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

describe('MCP tool xero_get_document (wire-level)', () => {
  it(
    'tools/list advertises xero_get_document as a read-only tool with the right filter params',
    async () => {
      const { mcp } = await harness(TOKEN);

      const response = await mcp.request('tools/list', {});
      expect(response.error, `JSON-RPC error: ${JSON.stringify(response.error)}`).toBeUndefined();
      const tools = response.result?.tools ?? [];
      const tool = tools.find((t) => t.name === TOOL_NAME);
      expect(tool, `tool ${TOOL_NAME} not found in tools/list: ${JSON.stringify(tools.map((t) => t.name))}`).toBeTruthy();

      const schema = tool.inputSchema;
      expect(schema, 'inputSchema missing').toBeTruthy();
      expect(schema.type).toBe('object');
      const props = schema.properties || {};
      for (const key of ['invoice_number', 'amount', 'q', 'date_from', 'date_to', 'tenant_id', 'limit']) {
        expect(props, `inputSchema.properties missing "${key}"`).toHaveProperty(key);
      }

      // Read-only: must NOT declare a confirm property.
      expect(props, 'read-only tool must not declare a confirm property').not.toHaveProperty('confirm');

      // Must not mark every filter as JSON-Schema required (they're each individually optional;
      // the "at least one" rule is enforced at call time, not via schema `required`).
      const required = schema.required || [];
      for (const key of ['invoice_number', 'amount', 'q', 'date_from', 'date_to']) {
        expect(required, `schema wrongly marks "${key}" as required`).not.toContain(key);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'calling with invoice_number hits the stub exactly once at the search path with invoice_number and limit in the query',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const response = await callTool(mcp, { invoice_number: 'INV-0263' });
      expectSucceeded(response);

      const rec = onlySearchRequest(stub);
      const params = queryParams(rec);
      expect(params.get('invoice_number')).toBe('INV-0263');
      expect(params.has('limit')).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'view_url from the backend survives into the tool result verbatim',
    async () => {
      const { mcp } = await harness(TOKEN);

      const response = await callTool(mcp, { invoice_number: 'INV-0263' });
      const text = expectSucceeded(response);

      expect(text).toContain(ROW_INVOICE.view_url);
      expect(text).toContain(ROW_BANK_TXN_NULLS.view_url);
    },
    TEST_TIMEOUT,
  );

  it(
    'forwards every filter param under the right key, including a q with a space and a % that round-trips exactly',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const args = {
        invoice_number: 'INV-ADV-777',
        amount: '1234.56',
        q: 'de Akker 50% deposit',
        date_from: '2025-01-01',
        date_to: '2025-12-31',
        tenant_id: 'tenant-adv-abc',
      };

      const response = await callTool(mcp, args);
      expectSucceeded(response);

      const rec = onlySearchRequest(stub);
      // Assert the wire actually encoded the space/percent (not sent raw/broken).
      expect(rec.url).not.toContain(' '); // a literal space in a URL would be malformed
      const params = queryParams(rec);
      for (const [key, value] of Object.entries(args)) {
        expect(params.get(key), `query param "${key}" missing or wrong`).toBe(value);
      }
      // Explicit round-trip check for the gnarly value.
      expect(params.get('q')).toBe('de Akker 50% deposit');
    },
    TEST_TIMEOUT,
  );

  it(
    'clamps limit: 500 -> 100, 0 -> 1, omitted -> 20',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      expectSucceeded(await callTool(mcp, { invoice_number: 'A', limit: 500 }));
      expectSucceeded(await callTool(mcp, { invoice_number: 'B', limit: 0 }));
      expectSucceeded(await callTool(mcp, { invoice_number: 'C' }));

      const reqs = searchRequests(stub);
      expect(reqs.length).toBe(3);

      const limits = reqs.map((r) => queryParams(r).get('limit'));
      expect(limits[0]).toBe('100');
      expect(limits[1]).toBe('1');
      expect(limits[2]).toBe('20');
    },
    TEST_TIMEOUT,
  );

  it(
    'no-filter call {} returns isError=true mentioning a required filter, and makes NO HTTP request',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const response = await callTool(mcp, {});
      const text = expectFailed(response);
      // The contract only requires the message to convey "at least one filter is required";
      // it doesn't mandate the literal word "filter" — assert on the semantic content instead
      // (either phrasing is acceptable, but it must reference the "at least one ... required"
      // rule and name at least one of the actual filter params).
      expect(text.toLowerCase()).toMatch(/at least one/);
      expect(text.toLowerCase()).toMatch(/require/);
      expect(text.toLowerCase()).toMatch(/invoice_number|amount|date_from|date_to|\bq\b/);

      expect(stub.requests.length, `expected no HTTP requests at all, saw: ${JSON.stringify(stub.requests)}`).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'whitespace-only q ("   ") is treated as no filter: isError=true, no HTTP request',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const response = await callTool(mcp, { q: '   ' });
      const text = expectFailed(response);
      expect(text.toLowerCase()).toMatch(/at least one/);
      expect(text.toLowerCase()).toMatch(/require/);

      expect(stub.requests.length, `expected no HTTP requests, saw: ${JSON.stringify(stub.requests)}`).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'sends Bearer <token> when KLIKK_API_TOKEN is set, and no Authorization header (no phantom Bearer) when unset',
    async () => {
      // With token.
      {
        const { stub, mcp } = await harness(TOKEN);
        expectSucceeded(await callTool(mcp, { invoice_number: 'INV-0263' }));
        const rec = onlySearchRequest(stub);
        expect(rec.headers.authorization).toBe(`Bearer ${TOKEN}`);
        expect(rawAuthHeaders(rec)).toHaveLength(1);
        expectNoPhantomBearer(stub);
      }

      // Without token.
      {
        const { stub, mcp } = await harness(undefined);
        expectSucceeded(await callTool(mcp, { invoice_number: 'INV-0263' }));
        const rec = onlySearchRequest(stub);
        expect(rec.headers.authorization).toBeUndefined();
        expect(rawAuthHeaders(rec)).toHaveLength(0);
        expect(JSON.stringify(rec.headers)).not.toMatch(/bearer/i);
        expectNoPhantomBearer(stub);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'backend 401 -> tool isError=true, text contains 401, and the token value never leaks',
    async () => {
      const failingHandler = (req, res, recorded) => {
        const text = JSON.stringify({ detail: 'Invalid token.' });
        res.writeHead(401, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };
      const { stub, mcp } = await harness(TOKEN, failingHandler);

      const response = await callTool(mcp, { invoice_number: 'INV-0263' });
      const text = expectFailed(response);
      expect(text).toContain('401');
      expect(text).not.toContain(TOKEN);
      expect(mcp.stderr).not.toContain(TOKEN);

      const rec = onlySearchRequest(stub);
      expect(rec.headers.authorization).toBe(`Bearer ${TOKEN}`);
    },
    TEST_TIMEOUT,
  );

  it(
    'empty result set succeeds (not an error), reports count 0 and an empty documents array',
    async () => {
      const emptyHandler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === SEARCH_PATH) {
          const text = JSON.stringify({ count: 0, limit: 20, results: [] });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
          res.end(text);
          return;
        }
        const text = JSON.stringify({ count: 0, categories: [], items: [] });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };
      const { mcp } = await harness(TOKEN, emptyHandler);

      const response = await callTool(mcp, { q: 'nothing matches this' });
      const text = expectSucceeded(response);

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Some tools wrap JSON in prose; fall back to substring checks.
        expect(text).toMatch(/"count"\s*:\s*0/);
        expect(text).toMatch(/"documents"\s*:\s*\[\s*\]/);
        return;
      }
      expect(parsed.count).toBe(0);
      expect(Array.isArray(parsed.documents)).toBe(true);
      expect(parsed.documents).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'ADVERSARIAL: a BankTransaction-shaped row with invoice_number/date/total all null is not dropped and does not crash the tool',
    async () => {
      const { mcp } = await harness(TOKEN);

      // Default stub returns both ROW_INVOICE and ROW_BANK_TXN_NULLS.
      const response = await callTool(mcp, { q: 'statement' });
      const text = expectSucceeded(response);

      expect(text).toContain(ROW_BANK_TXN_NULLS.file_name);
      expect(text).toContain(ROW_BANK_TXN_NULLS.transaction_id);
      expect(text).toContain(ROW_BANK_TXN_NULLS.view_url);

      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return; // already asserted presence above via substrings
      }
      expect(Array.isArray(parsed.documents)).toBe(true);
      expect(parsed.documents.length).toBeGreaterThanOrEqual(2);
      const nullRow = parsed.documents.find((d) => d.id === ROW_BANK_TXN_NULLS.id);
      expect(nullRow, 'null-shape row missing from documents[]').toBeTruthy();
      expect(nullRow.invoice_number == null).toBe(true);
      expect(nullRow.total == null).toBe(true);
      expect(nullRow.date == null).toBe(true);
    },
    TEST_TIMEOUT,
  );

  it(
    'ADVERSARIAL: backend returns a bare array instead of the {results: [...]} envelope without crashing the server process',
    async () => {
      const bareArrayHandler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === SEARCH_PATH) {
          const text = JSON.stringify([ROW_INVOICE]);
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
          res.end(text);
          return;
        }
        const text = JSON.stringify({ count: 0, categories: [], items: [] });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        res.end(text);
      };
      const { mcp } = await harness(TOKEN, bareArrayHandler);

      const response = await callTool(mcp, { invoice_number: 'INV-0263' });
      // We do not know in advance whether the tool tolerates this malformed shape or reports
      // an error — either is acceptable AS LONG AS the process doesn't crash / hang and the
      // response is a well-formed JSON-RPC result.
      expect(response.error, `JSON-RPC transport-level error: ${JSON.stringify(response.error)}`).toBeUndefined();
      expect(response.result?.content?.[0]?.text).toBeTypeOf('string');
      // The child process must still be alive/responsive for a follow-up call.
      const followUp = await callTool(mcp, { invoice_number: 'INV-0263' });
      expect(followUp.error).toBeUndefined();
    },
    TEST_TIMEOUT,
  );
});
