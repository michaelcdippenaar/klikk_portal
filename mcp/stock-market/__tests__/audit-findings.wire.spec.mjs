/**
 * ADVERSARIAL wire-level test for the six Klikk Financials audit-finding MCP tools:
 *   list_audit_findings, get_audit_finding, add_audit_finding, update_audit_finding,
 *   comment_audit_finding, audit_findings_summary.
 *
 * Claims under test (the frozen CONTRACT, not the implementing agent's diff):
 *   - tools/list advertises all six; the three MUTATING tools declare `confirm` in
 *     inputSchema.properties AND list it in inputSchema.required; the three read-only
 *     tools declare NO `confirm` property at all.
 *   - Mutating tools refuse confirm-missing, confirm:false AND confirm:"true" (a truthy
 *     STRING — requireConfirm demands strictly `confirm === true`) with isError=true and
 *     ZERO outbound HTTP requests.
 *   - Authorization: Bearer ${KLIKK_API_TOKEN} goes out exactly once per request when the
 *     env var is set; NO Authorization header at all (no "Bearer undefined") when unset.
 *     The token value never appears in tool output, stdout, or stderr.
 *   - Wire mapping: GET /audit/findings/ (filters + page_size), GET /audit/findings/<id>/,
 *     POST /audit/findings/, PATCH /audit/findings/<id>/,
 *     POST /audit/findings/<id>/comments/, GET /audit/findings/summary/.
 *     METHODS are asserted, not just paths — a POST where the contract says PATCH is a bug.
 *   - No-filter list call still hits the backend (the backend owns the FY default) and the
 *     `fy` query param is ABSENT — never `fy=undefined` / `fy=null`.
 *   - Missing required args on the mutating tools throw BEFORE any HTTP request.
 *   - update_audit_finding: note-only sends ONLY the comment POST (no PATCH); note+status
 *     sends BOTH and the PATCH body must NOT contain `note`.
 *   - Realistic rows (amount:null, due_date:null, check_code:"", asana_gid:null, mixed
 *     evidence, a title carrying "R429,110.39") round-trip un-dropped, and STRING amounts
 *     ("429110.39", "1234567890123.45", "579160.00") stay strings — never coerced to
 *     numbers, never losing the trailing-zero cents.
 *   - Backend 400 / 401 / 404, a bare-array body, an empty result set and a missing
 *     `totals` key never crash or hang the child — a follow-up call on the SAME process
 *     must still succeed.
 *
 * This test does NOT read the source of the change under test. It stands up a real stub
 * HTTP server, spawns the real server.mjs over stdio, drives real JSON-RPC tools/call
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

const TOKEN = 'test-token-audit-findings-777';
const TEST_TIMEOUT = 30_000;
const RPC_TIMEOUT = 20_000;

const LIST_PATH = '/audit/findings/';
const SUMMARY_PATH = '/audit/findings/summary/';
const detailPath = (id) => `/audit/findings/${id}/`;
const commentsPath = (id) => `/audit/findings/${id}/comments/`;

const READ_TOOLS = ['list_audit_findings', 'get_audit_finding', 'audit_findings_summary'];
const MUTATING_TOOLS = ['add_audit_finding', 'update_audit_finding', 'comment_audit_finding'];

/* ------------------------------------------------------------------ realistic backend rows
 * Shapes copied from the frozen contract's "Serialised finding dict" — amounts are STRINGS
 * (2dp) or null, due_date is 'YYYY-MM-DD' or null, evidence is a list of {type, ref, note}. */

const ROW_MAIN = {
  id: 12,
  fy: 2026,
  ref: 'FY26-012',
  title: 'R458,498 of payments coded to loan accounts though cash left a Klikk bank account (BNK-05 MISPOSTED)',
  severity: 'MEDIUM',
  status: 'OPEN',
  category: 'BNK',
  amount: '429110.39',
  currency: 'ZAR',
  description: 'Cash left the Investec account but the ledger leg was posted to a director loan account.',
  evidence: [{ type: 'journal', ref: 'JRN-104882', note: 'payment 2025-09-26' }],
  owner: 'bookkeeper',
  due_date: '2026-09-30',
  source: 'internal-audit run 13',
  check_code: 'BNK-05',
  asana_gid: '1217632488924819',
  created_by: 'seed',
  updated_by: '',
  created_at: '2026-08-20T08:00:00+02:00',
  updated_at: '2026-08-20T08:00:00+02:00',
  comment_count: 1,
  attachment_count: 1,
};

/** The gnarly production shape the brief demands: nulls, empty strings, mixed evidence,
 *  and a real ZAR amount with a comma in the TITLE (must survive verbatim). */
const ROW_NULLS = {
  id: 2,
  fy: 2026,
  ref: 'FY26-002',
  title: 'Payments made before supplier bill captured — R429,110.39 across 14 suppliers',
  severity: 'HIGH',
  status: 'OPEN',
  category: 'SUP',
  amount: null,
  currency: 'ZAR',
  description: 'Cash-before-bill pattern; amounts quantified in the title pending per-supplier split.',
  evidence: [
    { type: 'journal', ref: 'JRN-99120', note: 'first occurrence' },
    { type: 'slip', ref: '314', note: '' },
    { type: 'url', ref: 'https://app.asana.com/0/1217633700114593', note: 'Asana task' },
    { type: 'note', ref: '', note: 'per MC WhatsApp 2026-08-14 — Slippies group' },
  ],
  owner: 'MC',
  due_date: null,
  source: 'internal-audit run 13',
  check_code: '',
  asana_gid: null,
  created_by: 'seed',
  updated_by: '',
  created_at: '2026-08-20T08:01:00+02:00',
  updated_at: '2026-08-20T08:01:00+02:00',
  comment_count: 0,
  attachment_count: 0,
};

/** Precision trap: bigger than float32, exercises double round-trips. Must stay a string. */
const ROW_BIG = {
  ...ROW_MAIN,
  id: 3,
  ref: 'FY26-003',
  title: 'Cumulative intercompany sweep misposting',
  severity: 'HIGH',
  category: 'BAL',
  amount: '1234567890123.45',
  due_date: null,
  check_code: '',
  asana_gid: '',
  comment_count: 0,
  attachment_count: 0,
};

/** Trailing-zero trap: Number('579160.00') JSON-stringifies as 579160 — cents vanish. */
const ROW_TRAILING_ZERO = {
  ...ROW_MAIN,
  id: 9,
  ref: 'FY26-009',
  title: 'R579k FY2026 spend with no attachment and no slip (DOC-03)',
  severity: 'MEDIUM',
  category: 'DOC',
  amount: '579160.00',
  check_code: 'DOC-03',
  asana_gid: '',
  comment_count: 0,
  attachment_count: 0,
};

const LIST_PAYLOAD = {
  count: 4,
  page: 1,
  page_size: 50,
  num_pages: 1,
  fy: 2026,
  current_fy: 2027,
  totals: { count: 4, amount: '1234568898393.84' },
  results: [ROW_MAIN, ROW_NULLS, ROW_BIG, ROW_TRAILING_ZERO],
};

const DETAIL_COMMENT = {
  id: 7,
  finding_id: 12,
  text: 'Investec statement pulled — awaiting bookkeeper recon of the mirrored account',
  author: 'mcp',
  created_at: '2026-08-20T09:00:00+02:00',
};

const DETAIL_PAYLOAD = {
  finding: ROW_MAIN,
  comments: [DETAIL_COMMENT],
  attachments: [
    {
      id: 3,
      finding_id: 12,
      original_name: 'bnk05-recon.xlsx',
      content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      size: 48123,
      uploaded_by: 'mcp',
      created_at: '2026-08-20T09:05:00+02:00',
      view_url:
        'https://console.8-bit.space/backend/audit/findings/attachment/3/file/?s=0123456789abcdef0123456789abcdef',
    },
  ],
};

const CREATED_FINDING = {
  ...ROW_MAIN,
  id: 41,
  fy: 2027,
  ref: 'FY27-001',
  title: 'Adversarial created finding',
  severity: 'HIGH',
  category: 'SUP',
  status: 'OPEN',
  amount: '1234.50',
  created_by: 'mcp',
  comment_count: 0,
  attachment_count: 0,
};

const SUMMARY_PAYLOAD = {
  fy: 2026,
  current_fy: 2027,
  fy_options: [2027, 2026],
  count: 10,
  amount: '1775021.82',
  open_count: 10,
  by_severity: [
    { key: 'HIGH', count: 6, amount: '715704.41' },
    { key: 'MEDIUM', count: 3, amount: '1042484.01' },
    { key: 'LOW', count: 1, amount: '3166.42' },
  ],
  by_status: [{ key: 'OPEN', count: 10, amount: '1775021.82' }],
  by_category: [
    { key: 'PAYROLL', count: 3, amount: '122050.01' },
    { key: 'SUP', count: 3, amount: '570276.81' },
  ],
  by_owner: [{ key: 'bookkeeper', count: 4, amount: '1469934.81' }],
};

/* ------------------------------------------------------------------ stub backend */

function sendJson(res, status, payload) {
  const text = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(text),
  });
  res.end(text);
}

/** Route table matching the frozen backend contract. Method-strict on purpose: a PATCH
 *  arriving as POST falls through to the harmless fallback and the wire assertions catch it. */
function defaultRoute(req, res, recorded) {
  const urlPath = req.url.split('?')[0];
  const mComments = urlPath.match(/^\/audit\/findings\/(\d+)\/comments\/$/);
  const mDetail = urlPath.match(/^\/audit\/findings\/(\d+)\/$/);

  if (req.method === 'GET' && urlPath === SUMMARY_PATH) return sendJson(res, 200, SUMMARY_PAYLOAD);
  if (req.method === 'GET' && urlPath === LIST_PATH) return sendJson(res, 200, LIST_PAYLOAD);
  if (req.method === 'POST' && urlPath === LIST_PATH) return sendJson(res, 201, CREATED_FINDING);
  if (req.method === 'POST' && mComments) {
    let body = {};
    try {
      body = JSON.parse(recorded.body || '{}');
    } catch {
      /* leave empty */
    }
    return sendJson(res, 201, {
      id: 99,
      finding_id: Number(mComments[1]),
      text: typeof body.text === 'string' ? body.text : '',
      author: 'mcp',
      created_at: '2026-08-20T10:15:00+02:00',
    });
  }
  if (req.method === 'GET' && mDetail) return sendJson(res, 200, DETAIL_PAYLOAD);
  if (req.method === 'PATCH' && mDetail) {
    let body = {};
    try {
      body = JSON.parse(recorded.body || '{}');
    } catch {
      /* leave empty */
    }
    return sendJson(res, 200, { ...ROW_MAIN, ...body, updated_by: 'mcp' });
  }
  // Anything unrelated to the tools under test: harmless empty envelope.
  return sendJson(res, 200, { count: 0, results: [] });
}

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

async function startStub(customHandler) {
  const { requests, server } = makeStubServer(customHandler || defaultRoute);
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
    clientInfo: { name: 'adversarial-audit-findings-test', version: '0.0.0' },
  });
  expect(init.result?.serverInfo?.name).toBe('klikk-financials');

  return { stub, mcp };
}

function callTool(mcp, name, args) {
  return mcp.request('tools/call', { name, arguments: args });
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

function tryParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function requestsTo(stub, method, urlPath) {
  return stub.requests.filter((r) => r.method === method && r.url.split('?')[0] === urlPath);
}

function onlyRequest(stub, method, urlPath) {
  const found = requestsTo(stub, method, urlPath);
  expect(
    found.length,
    `expected exactly one ${method} ${urlPath} on the wire, got ${found.length}. ` +
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

/** Minimal VALID args per mutating tool, so the ONLY thing that can refuse is the confirm gate. */
const VALID_MUTATING_ARGS = {
  add_audit_finding: {
    title: 'Adversarial created finding',
    severity: 'HIGH',
    category: 'SUP',
    description: 'created by the wire test',
    source: 'wire-test 2026-08-20',
  },
  update_audit_finding: { id: 12, status: 'RESOLVED' },
  comment_audit_finding: { id: 12, text: 'adversarial comment' },
};

/* ================================================================== tests */

describe('audit-finding MCP tools — tools/list contract', () => {
  it(
    'advertises all six tools; mutating ones declare confirm (and require it); read-only ones do NOT declare confirm',
    async () => {
      const { mcp } = await harness(TOKEN);

      const response = await mcp.request('tools/list', {});
      expect(response.error, `JSON-RPC error: ${JSON.stringify(response.error)}`).toBeUndefined();
      const tools = response.result?.tools ?? [];
      const byName = Object.fromEntries(tools.map((t) => [t.name, t]));

      const expectedProps = {
        list_audit_findings: ['fy', 'status', 'severity', 'category', 'owner', 'check_code', 'q', 'limit'],
        get_audit_finding: ['id'],
        add_audit_finding: [
          'fy', 'title', 'severity', 'category', 'description', 'source',
          'amount', 'owner', 'due_date', 'evidence', 'check_code', 'asana_gid', 'confirm',
        ],
        update_audit_finding: ['id', 'status', 'owner', 'due_date', 'amount', 'severity', 'category', 'note', 'confirm'],
        comment_audit_finding: ['id', 'text', 'confirm'],
        audit_findings_summary: ['fy'],
      };

      for (const name of [...READ_TOOLS, ...MUTATING_TOOLS]) {
        const tool = byName[name];
        expect(tool, `tool ${name} not found in tools/list: ${JSON.stringify(Object.keys(byName))}`).toBeTruthy();
        const schema = tool.inputSchema;
        expect(schema, `${name}: inputSchema missing`).toBeTruthy();
        expect(schema.type, `${name}: inputSchema.type`).toBe('object');
        const props = schema.properties || {};
        for (const key of expectedProps[name]) {
          expect(props, `${name}: inputSchema.properties missing "${key}"`).toHaveProperty(key);
        }
      }

      for (const name of MUTATING_TOOLS) {
        const schema = byName[name].inputSchema;
        expect(schema.properties, `${name} must declare confirm`).toHaveProperty('confirm');
        expect(schema.required || [], `${name} must list confirm in required`).toContain('confirm');
      }

      for (const name of READ_TOOLS) {
        const props = byName[name].inputSchema.properties || {};
        expect(props, `read-only tool ${name} must NOT declare a confirm property`).not.toHaveProperty('confirm');
      }
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — confirm gate (wire-level)', () => {
  it(
    'each mutating tool refuses confirm-missing, confirm:false AND confirm:"true" (string) with ZERO outbound HTTP requests',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const variants = [
        { label: 'missing', patch: {} },
        { label: 'false', patch: { confirm: false } },
        { label: 'string "true"', patch: { confirm: 'true' } },
      ];

      for (const name of MUTATING_TOOLS) {
        for (const { label, patch } of variants) {
          const response = await callTool(mcp, name, { ...VALID_MUTATING_ARGS[name], ...patch });
          const text = expectFailed(response);
          expect(text, `${name} with confirm=${label} must refuse mentioning confirm=true`).toMatch(/confirm\s*=?\s*true/i);
          expect(text, `${name} with confirm=${label} must use the Refusing... wording`).toMatch(/refus/i);
        }
      }

      // The critical assertion: nothing reached the wire, not for any of the nine calls.
      expect(
        stub.requests.length,
        `expected ZERO outbound HTTP requests, saw: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — Authorization header (wire-level)', () => {
  it(
    'sends Bearer <token> exactly once per request on read AND mutating calls, and never leaks the token',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const listText = expectSucceeded(await callTool(mcp, 'list_audit_findings', {}));
      const addText = expectSucceeded(
        await callTool(mcp, 'add_audit_finding', { ...VALID_MUTATING_ARGS.add_audit_finding, confirm: true }),
      );

      const read = onlyRequest(stub, 'GET', LIST_PATH);
      expect(read.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(rawAuthHeaders(read)).toHaveLength(1);

      const write = onlyRequest(stub, 'POST', LIST_PATH);
      expect(write.headers.authorization).toBe(`Bearer ${TOKEN}`);
      expect(rawAuthHeaders(write)).toHaveLength(1);

      expectNoPhantomBearer(stub);

      expect(listText).not.toContain(TOKEN);
      expect(addText).not.toContain(TOKEN);
      expect(mcp.stdoutLines.join('\n')).not.toContain(TOKEN);
      expect(mcp.stderr).not.toContain(TOKEN);
    },
    TEST_TIMEOUT,
  );

  it(
    'sends NO Authorization header at all (no "Bearer undefined") when KLIKK_API_TOKEN is unset',
    async () => {
      const { stub, mcp } = await harness(undefined);

      expectSucceeded(await callTool(mcp, 'list_audit_findings', {}));
      expectSucceeded(
        await callTool(mcp, 'comment_audit_finding', { id: 12, text: 'no-token comment', confirm: true }),
      );

      expect(stub.requests.length).toBeGreaterThanOrEqual(2);
      for (const recorded of stub.requests) {
        expect(
          recorded.headers.authorization,
          `unexpected auth header on ${recorded.method} ${recorded.url}`,
        ).toBeUndefined();
        expect(rawAuthHeaders(recorded)).toHaveLength(0);
        expect(JSON.stringify(recorded.headers)).not.toMatch(/bearer/i);
      }
      expectNoPhantomBearer(stub);
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — wire mapping (methods, paths, params)', () => {
  it(
    'list_audit_findings forwards every supplied filter under its own key and sends limit as page_size',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const args = {
        fy: 2026,
        status: 'OPEN,IN_PROGRESS',
        severity: 'HIGH,CRITICAL',
        category: 'SUP,BNK',
        owner: 'bookkeeper',
        check_code: 'BNK-05',
        q: 'loan account',
        limit: 75,
      };
      expectSucceeded(await callTool(mcp, 'list_audit_findings', args));

      const rec = onlyRequest(stub, 'GET', LIST_PATH);
      const params = queryParams(rec);
      expect(params.get('fy')).toBe('2026');
      expect(params.get('status')).toBe('OPEN,IN_PROGRESS');
      expect(params.get('severity')).toBe('HIGH,CRITICAL');
      expect(params.get('category')).toBe('SUP,BNK');
      expect(params.get('owner')).toBe('bookkeeper');
      expect(params.get('check_code')).toBe('BNK-05');
      expect(params.get('q')).toBe('loan account');
      // The contract maps limit -> page_size on the wire.
      expect(params.get('page_size')).toBe('75');
    },
    TEST_TIMEOUT,
  );

  it(
    'list_audit_findings with NO filters still calls the backend once, with fy ABSENT (never fy=undefined/null) and default page_size',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const text = expectSucceeded(await callTool(mcp, 'list_audit_findings', {}));

      const rec = onlyRequest(stub, 'GET', LIST_PATH);
      const params = queryParams(rec);
      for (const key of ['fy', 'status', 'severity', 'category', 'owner', 'check_code', 'q']) {
        expect(params.has(key), `query param "${key}" must be absent when not supplied, url=${rec.url}`).toBe(false);
      }
      expect(rec.url).not.toMatch(/undefined|null|NaN/);
      expect(params.get('page_size')).toBe('50');

      // Result envelope keys per contract: count, fy, current_fy, totals, findings, agent_brief.
      const parsed = tryParse(text);
      if (parsed) {
        expect(parsed.count).toBe(4);
        expect(parsed.fy).toBe(2026);
        expect(parsed.current_fy).toBe(2027);
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(parsed.findings).toHaveLength(4);
        expect(parsed.totals).toBeTruthy();
        expect(Array.isArray(parsed.agent_brief)).toBe(true);
        expect(parsed.generated_at).toBeTruthy();
        expect(parsed.api_base_url).toBeTruthy();
      } else {
        expect(text).toMatch(/"findings"/);
        expect(text).toMatch(/"totals"/);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'a q containing a space, %, & and a non-ASCII char round-trips through the query string exactly',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const gnarly = 'R429,110 & 50% déjà vu';
      expectSucceeded(await callTool(mcp, 'list_audit_findings', { q: gnarly }));

      const rec = onlyRequest(stub, 'GET', LIST_PATH);
      expect(rec.url).not.toContain(' '); // a literal space in the request-target is malformed
      const params = queryParams(rec);
      // If the & was not encoded it would split the param and q would come back as 'R429,110 '.
      expect(params.get('q')).toBe(gnarly);
    },
    TEST_TIMEOUT,
  );

  it(
    'get_audit_finding hits GET /audit/findings/<id>/ exactly once, coerces a string id, and returns finding + comments',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const text = expectSucceeded(await callTool(mcp, 'get_audit_finding', { id: 12 }));
      onlyRequest(stub, 'GET', detailPath(12));
      expect(text).toContain('FY26-012');
      expect(text).toContain(DETAIL_COMMENT.text);

      // String id must be coerced to a number, not interpolated raw / rejected.
      expectSucceeded(await callTool(mcp, 'get_audit_finding', { id: '12' }));
      expect(requestsTo(stub, 'GET', detailPath(12))).toHaveLength(2);
      // Nothing may have leaked to the list endpoint by accident.
      expect(requestsTo(stub, 'GET', LIST_PATH)).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'add_audit_finding POSTs to /audit/findings/ exactly once with a JSON body carrying every supplied field verbatim',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const args = {
        fy: 2026,
        title: 'Aurras R138,000 paid with no invoice (R64,400 personal + R73,600)',
        severity: 'HIGH',
        category: 'SUP',
        description: 'Two payments with no supporting invoice located in either intake channel.',
        source: 'internal-audit run 13',
        amount: '138000.00',
        owner: 'MC',
        due_date: '2026-09-15',
        evidence: [
          { type: 'bank', ref: 'INV-STMT-2026-03', note: 'both payments visible' },
          { type: 'note', ref: '', note: 'no slip in Slippies register' },
        ],
        check_code: 'SUP-02',
        asana_gid: '1217591235585694',
        confirm: true,
      };

      const text = expectSucceeded(await callTool(mcp, 'add_audit_finding', args));

      const write = onlyRequest(stub, 'POST', LIST_PATH);
      expect(write.headers['content-type']).toContain('application/json');
      const body = JSON.parse(write.body);
      expect(body.title).toBe(args.title);
      expect(body.severity).toBe('HIGH');
      expect(body.category).toBe('SUP');
      expect(body.description).toBe(args.description);
      expect(body.source).toBe('internal-audit run 13'); // sent verbatim per contract
      expect(body.amount).toBe('138000.00');
      expect(body.owner).toBe('MC');
      expect(body.due_date).toBe('2026-09-15');
      expect(body.evidence).toEqual(args.evidence);
      expect(body.check_code).toBe('SUP-02');
      expect(body.asana_gid).toBe('1217591235585694');
      expect(body.fy).toBe(2026);

      // No stray writes anywhere else.
      expect(stub.requests.filter((r) => r.method !== 'POST')).toHaveLength(0);

      const parsed = tryParse(text);
      if (parsed) {
        expect(parsed.created).toBe(true);
        expect(parsed.finding).toBeTruthy();
      } else {
        expect(text).toMatch(/"created"\s*:\s*true/);
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'update_audit_finding uses PATCH (not POST/PUT) on /audit/findings/<id>/ and forwards only the editable fields',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      expectSucceeded(
        await callTool(mcp, 'update_audit_finding', {
          id: 12,
          status: 'IN_PROGRESS',
          owner: 'bookkeeper',
          due_date: '2026-10-31',
          confirm: true,
        }),
      );

      const patch = onlyRequest(stub, 'PATCH', detailPath(12));
      const body = JSON.parse(patch.body);
      expect(body.status).toBe('IN_PROGRESS');
      expect(body.owner).toBe('bookkeeper');
      expect(body.due_date).toBe('2026-10-31');
      expect(body).not.toHaveProperty('note');
      expect(body).not.toHaveProperty('text');

      // A POST where the contract says PATCH is a real bug — assert none happened.
      expect(stub.requests.filter((r) => r.method === 'POST')).toHaveLength(0);
      expect(stub.requests.filter((r) => r.method === 'PUT')).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'update_audit_finding with ONLY note sends the comment POST and NO PATCH at all',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const note = 'chased the bookkeeper — recon promised by Friday';
      expectSucceeded(await callTool(mcp, 'update_audit_finding', { id: 12, note, confirm: true }));

      const commentPost = onlyRequest(stub, 'POST', commentsPath(12));
      const body = JSON.parse(commentPost.body);
      expect(body.text).toBe(note);

      expect(
        stub.requests.filter((r) => r.method === 'PATCH'),
        `note-only update must not PATCH; wire: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
      ).toHaveLength(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'update_audit_finding with note + status sends BOTH calls and the PATCH body does NOT contain note',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const note = 'resolved after Investec mirror check';
      const text = expectSucceeded(
        await callTool(mcp, 'update_audit_finding', { id: 12, status: 'RESOLVED', note, confirm: true }),
      );

      const patch = onlyRequest(stub, 'PATCH', detailPath(12));
      const patchBody = JSON.parse(patch.body);
      expect(patchBody.status).toBe('RESOLVED');
      expect(patchBody, 'note is NOT a PATCH field — it must become a comment only').not.toHaveProperty('note');

      const commentPost = onlyRequest(stub, 'POST', commentsPath(12));
      expect(JSON.parse(commentPost.body).text).toBe(note);

      const parsed = tryParse(text);
      if (parsed) {
        expect(parsed.finding).toBeTruthy();
        expect(parsed.comment).toBeTruthy();
      }
    },
    TEST_TIMEOUT,
  );

  it(
    'comment_audit_finding POSTs to /audit/findings/<id>/comments/ exactly once with the text verbatim',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const commentText = 'SARS verification cleared — 50% déjà vu & counting\nsecond line';
      const text = expectSucceeded(
        await callTool(mcp, 'comment_audit_finding', { id: 2, text: commentText, confirm: true }),
      );

      const post = onlyRequest(stub, 'POST', commentsPath(2));
      expect(JSON.parse(post.body).text).toBe(commentText);
      // No PATCH / no other writes.
      expect(stub.requests.filter((r) => r.method === 'PATCH')).toHaveLength(0);

      const parsed = tryParse(text);
      if (parsed) expect(parsed.comment).toBeTruthy();
      else expect(text).toMatch(/"comment"/);
    },
    TEST_TIMEOUT,
  );

  it(
    'audit_findings_summary GETs /audit/findings/summary/ with fy when supplied, WITHOUT fy when omitted, and briefs the worst bucket',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      const text = expectSucceeded(await callTool(mcp, 'audit_findings_summary', { fy: 2026 }));
      const withFy = onlyRequest(stub, 'GET', SUMMARY_PATH);
      expect(queryParams(withFy).get('fy')).toBe('2026');

      expectSucceeded(await callTool(mcp, 'audit_findings_summary', {}));
      const both = requestsTo(stub, 'GET', SUMMARY_PATH);
      expect(both).toHaveLength(2);
      const noFy = both[1];
      expect(queryParams(noFy).has('fy'), `fy must be absent when omitted, url=${noFy.url}`).toBe(false);
      expect(noFy.url).not.toMatch(/undefined|null|NaN/);

      // Summary payload passes through; agent_brief names worst severity bucket + open count.
      const parsed = tryParse(text);
      if (parsed) {
        expect(parsed.open_count).toBe(10);
        expect(Array.isArray(parsed.by_severity)).toBe(true);
        expect(Array.isArray(parsed.agent_brief)).toBe(true);
        const brief = parsed.agent_brief.join(' ');
        expect(brief).toMatch(/HIGH/);
        expect(brief).toMatch(/\b10\b/);
      } else {
        expect(text).toMatch(/"by_severity"/);
        expect(text).toMatch(/HIGH/);
      }
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — required args throw before any HTTP request', () => {
  it(
    'add_audit_finding: omitting any one of title/severity/category/description/source throws "<name> is required" with zero requests',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      for (const missing of ['title', 'severity', 'category', 'description', 'source']) {
        const args = { ...VALID_MUTATING_ARGS.add_audit_finding, confirm: true };
        delete args[missing];
        const response = await callTool(mcp, 'add_audit_finding', args);
        const text = expectFailed(response);
        expect(text.toLowerCase(), `omitting ${missing} must throw "<name> is required"`).toContain(
          `${missing} is required`,
        );
      }

      expect(
        stub.requests.length,
        `expected ZERO requests, saw: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'get_audit_finding without an id (and with a blank id) throws "id is required" with zero requests',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      for (const args of [{}, { id: '' }]) {
        const response = await callTool(mcp, 'get_audit_finding', args);
        const text = expectFailed(response);
        expect(text.toLowerCase()).toContain('id is required');
      }

      expect(stub.requests.length).toBe(0);
    },
    TEST_TIMEOUT,
  );

  it(
    'update_audit_finding with no editable field throws "nothing to update", and comment/update without id/text also refuse — all with zero requests',
    async () => {
      const { stub, mcp } = await harness(TOKEN);

      // Nothing to update: id + confirm only.
      {
        const response = await callTool(mcp, 'update_audit_finding', { id: 12, confirm: true });
        const text = expectFailed(response);
        expect(text.toLowerCase()).toContain('nothing to update');
      }
      // Missing id on update.
      {
        const response = await callTool(mcp, 'update_audit_finding', { status: 'RESOLVED', confirm: true });
        const text = expectFailed(response);
        expect(text.toLowerCase()).toMatch(/required/);
      }
      // Missing text on comment.
      {
        const response = await callTool(mcp, 'comment_audit_finding', { id: 12, confirm: true });
        const text = expectFailed(response);
        expect(text.toLowerCase()).toMatch(/required/);
      }
      // Missing id on comment.
      {
        const response = await callTool(mcp, 'comment_audit_finding', { text: 'orphan comment', confirm: true });
        const text = expectFailed(response);
        expect(text.toLowerCase()).toMatch(/required/);
      }

      expect(
        stub.requests.length,
        `expected ZERO requests, saw: ${JSON.stringify(stub.requests.map((r) => `${r.method} ${r.url}`))}`,
      ).toBe(0);
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — realistic payload survival', () => {
  it(
    'a row with amount:null, due_date:null, check_code:"", asana_gid:null, mixed evidence and a comma-ZAR title is not dropped, truncated or NaN-ed',
    async () => {
      const { mcp } = await harness(TOKEN);

      const text = expectSucceeded(await callTool(mcp, 'list_audit_findings', {}));

      // Title with the real ZAR comma amount survives verbatim.
      expect(text).toContain('R429,110.39');
      expect(text).toContain('FY26-002');
      // Evidence array of mixed-type objects survives.
      expect(text).toContain('JRN-99120');
      expect(text).toContain('https://app.asana.com/0/1217633700114593');
      expect(text).toContain('per MC WhatsApp 2026-08-14');

      const parsed = tryParse(text);
      if (!parsed) {
        // Prose-wrapped fallback: still must not have manufactured NaN.
        expect(text).not.toMatch(/\bNaN\b/);
        return;
      }
      expect(parsed.findings).toHaveLength(4);
      const nullRow = parsed.findings.find((f) => f.ref === 'FY26-002');
      expect(nullRow, 'null-shape row missing from findings[]').toBeTruthy();
      expect(nullRow.amount).toBeNull();
      expect(nullRow.due_date).toBeNull();
      expect(nullRow.check_code).toBe('');
      expect(nullRow.asana_gid).toBeNull();
      expect(nullRow.evidence).toEqual(ROW_NULLS.evidence);
      expect(nullRow.title).toBe(ROW_NULLS.title);
    },
    TEST_TIMEOUT,
  );

  it(
    'string amounts stay STRINGS: "429110.39", "1234567890123.45" and the trailing-zero "579160.00" are never number-coerced',
    async () => {
      const { mcp } = await harness(TOKEN);

      const text = expectSucceeded(await callTool(mcp, 'list_audit_findings', {}));

      const parsed = tryParse(text);
      if (parsed) {
        const byRef = Object.fromEntries(parsed.findings.map((f) => [f.ref, f]));
        expect(byRef['FY26-012'].amount).toBe('429110.39');
        expect(typeof byRef['FY26-012'].amount).toBe('string');
        expect(byRef['FY26-003'].amount).toBe('1234567890123.45');
        expect(typeof byRef['FY26-003'].amount).toBe('string');
        // The trailing-zero trap: Number('579160.00') re-serialises as 579160.
        expect(byRef['FY26-009'].amount).toBe('579160.00');
        expect(typeof byRef['FY26-009'].amount).toBe('string');
        expect(parsed.totals.amount).toBe('1234568898393.84');
        expect(typeof parsed.totals.amount).toBe('string');
      } else {
        // Fallback: the QUOTED forms must appear — an unquoted 579160 means coercion happened.
        expect(text).toMatch(/"429110\.39"/);
        expect(text).toMatch(/"1234567890123\.45"/);
        expect(text).toMatch(/"579160\.00"/);
        expect(text).toMatch(/"1234568898393\.84"/);
      }
      expect(text).not.toMatch(/\bNaN\b/);
    },
    TEST_TIMEOUT,
  );

  it(
    'empty result set succeeds (not an error) with count 0 and an empty findings array',
    async () => {
      const emptyHandler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === LIST_PATH) {
          return sendJson(res, 200, {
            count: 0,
            page: 1,
            page_size: 50,
            num_pages: 1,
            fy: 2026,
            current_fy: 2027,
            totals: { count: 0, amount: '0.00' },
            results: [],
          });
        }
        return defaultRoute(req, res, recorded);
      };
      const { mcp } = await harness(TOKEN, emptyHandler);

      const text = expectSucceeded(await callTool(mcp, 'list_audit_findings', { q: 'nothing matches this' }));
      const parsed = tryParse(text);
      if (parsed) {
        expect(parsed.count).toBe(0);
        expect(Array.isArray(parsed.findings)).toBe(true);
        expect(parsed.findings).toHaveLength(0);
      } else {
        expect(text).toMatch(/"count"\s*:\s*0/);
        expect(text).toMatch(/"findings"\s*:\s*\[\s*\]/);
      }
    },
    TEST_TIMEOUT,
  );
});

describe('audit-finding MCP tools — adversarial backend responses (no crash, no hang, child survives)', () => {
  it(
    'backend 400 with a validation detail on add_audit_finding -> isError with 400; a follow-up call on the SAME child succeeds',
    async () => {
      const handler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'POST' && urlPath === LIST_PATH) {
          return sendJson(res, 400, {
            detail: 'severity must be one of CRITICAL, HIGH, MEDIUM, LOW, INFO',
          });
        }
        return defaultRoute(req, res, recorded);
      };
      const { mcp } = await harness(TOKEN, handler);

      const response = await callTool(mcp, 'add_audit_finding', {
        ...VALID_MUTATING_ARGS.add_audit_finding,
        severity: 'SEVERE', // backend rejects it
        confirm: true,
      });
      const text = expectFailed(response);
      expect(text).toContain('400');

      const followUp = await callTool(mcp, 'list_audit_findings', {});
      expectSucceeded(followUp);
    },
    TEST_TIMEOUT,
  );

  it(
    'backend 401 on list -> isError with 401, the token never leaks, and the child still answers a follow-up',
    async () => {
      const handler = (req, res) => sendJson(res, 401, { detail: 'Invalid token.' });
      const { stub, mcp } = await harness(TOKEN, handler);

      const response = await callTool(mcp, 'list_audit_findings', {});
      const text = expectFailed(response);
      expect(text).toContain('401');
      expect(text).not.toContain(TOKEN);
      expect(mcp.stderr).not.toContain(TOKEN);

      const rec = onlyRequest(stub, 'GET', LIST_PATH);
      expect(rec.headers.authorization).toBe(`Bearer ${TOKEN}`);

      // Same child, second failing call — must be a clean tool error again, not a hang/crash.
      const again = await callTool(mcp, 'audit_findings_summary', {});
      const againText = expectFailed(again);
      expect(againText).not.toContain(TOKEN);
    },
    TEST_TIMEOUT,
  );

  it(
    'backend 404 on get_audit_finding -> isError with 404; a follow-up get on a live id succeeds on the SAME child',
    async () => {
      const handler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === detailPath(999)) {
          return sendJson(res, 404, { detail: 'finding not found' });
        }
        return defaultRoute(req, res, recorded);
      };
      const { mcp } = await harness(TOKEN, handler);

      const response = await callTool(mcp, 'get_audit_finding', { id: 999 });
      const text = expectFailed(response);
      expect(text).toContain('404');

      const followUp = await callTool(mcp, 'get_audit_finding', { id: 12 });
      const okText = expectSucceeded(followUp);
      expect(okText).toContain('FY26-012');
    },
    TEST_TIMEOUT,
  );

  it(
    'a bare array instead of the {results:[...]} envelope does not crash or hang the server process',
    async () => {
      const handler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === LIST_PATH) {
          return sendJson(res, 200, [ROW_MAIN, ROW_NULLS]);
        }
        return defaultRoute(req, res, recorded);
      };
      const { mcp } = await harness(TOKEN, handler);

      const response = await callTool(mcp, 'list_audit_findings', {});
      // Tolerating vs. erroring on the malformed shape are both acceptable — but the
      // response must be a well-formed JSON-RPC result and the child must stay alive.
      expect(response.error, `JSON-RPC transport-level error: ${JSON.stringify(response.error)}`).toBeUndefined();
      expect(response.result?.content?.[0]?.text).toBeTypeOf('string');

      const followUp = await callTool(mcp, 'audit_findings_summary', { fy: 2026 });
      expectSucceeded(followUp);
    },
    TEST_TIMEOUT,
  );

  it(
    'a list response with `totals` missing does not crash the tool; the SAME child answers a follow-up',
    async () => {
      const handler = (req, res, recorded) => {
        const urlPath = req.url.split('?')[0];
        if (req.method === 'GET' && urlPath === LIST_PATH) {
          const { totals, ...withoutTotals } = LIST_PAYLOAD;
          return sendJson(res, 200, withoutTotals);
        }
        return defaultRoute(req, res, recorded);
      };
      const { mcp } = await harness(TOKEN, handler);

      const response = await callTool(mcp, 'list_audit_findings', {});
      expect(response.error, `JSON-RPC transport-level error: ${JSON.stringify(response.error)}`).toBeUndefined();
      expect(response.result?.content?.[0]?.text).toBeTypeOf('string');
      // Whether the tool surfaces totals as undefined/null or omits it, it must not fabricate NaN.
      expect(response.result.content.map((p) => p.text).join('\n')).not.toMatch(/\bNaN\b/);

      const followUp = await callTool(mcp, 'get_audit_finding', { id: 12 });
      expectSucceeded(followUp);
    },
    TEST_TIMEOUT,
  );
});
