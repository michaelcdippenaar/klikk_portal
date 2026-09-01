/**
 * Wire-level test for xero_create_draft_invoice — the ONE Xero write tool.
 *
 * Claims under test, against a real spawned server.mjs and a stub backend:
 *   1. confirm !== true is refused CLIENT-SIDE: no request reaches the backend.
 *   2. Missing/blank instruction is refused client-side: no backend request.
 *   3. A fully-formed call POSTs to /xero/data/invoices/create-draft/ with the
 *      service token and passes the payload through verbatim.
 *   4. The tool result surfaces write_log_id and invoice_number (the audit
 *      trail MC must be shown).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
const SERVER_PATH = path.join(REPO_ROOT, 'mcp', 'stock-market', 'server.mjs');

const MCP_TOKEN = 'static-token-for-tests';
const API_TOKEN = 'service-token-for-tests';
const TEST_TIMEOUT = 30_000;

let child;
let baseUrl;
let stub;
const backendRequests = [];

beforeAll(async () => {
  stub = createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      backendRequests.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        write_log_id: 42,
        tenant_id: 't-1',
        tenant_name: 'Klikk (Pty) Ltd',
        invoice_id: 'abc-123',
        invoice_number: 'INV-0099',
        status: 'DRAFT',
        contact: { contact_id: 'c-1', name: 'Test Contact' },
        total: '115.00',
        currency_code: 'ZAR',
      }));
    });
  });
  stub.listen(0, '127.0.0.1');
  await once(stub, 'listening');

  const port = 18000 + Math.floor(Math.random() * 2000);
  baseUrl = `http://127.0.0.1:${port}`;
  child = spawn('node', [SERVER_PATH], {
    env: {
      ...process.env,
      KLIKK_MCP_TRANSPORT: 'http',
      KLIKK_MCP_HTTP_HOST: '127.0.0.1',
      KLIKK_MCP_HTTP_PORT: String(port),
      KLIKK_MCP_AUTH_TOKEN: MCP_TOKEN,
      KLIKK_API_TOKEN: API_TOKEN,
      KLIKK_API_BASE_URL: `http://127.0.0.1:${stub.address().port}`,
    },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start')), 10_000);
    child.stderr.on('data', (chunk) => {
      if (String(chunk).includes('listening')) { clearTimeout(timer); resolve(); }
    });
    child.on('exit', (code) => reject(new Error(`server exited early: ${code}`)));
  });
}, TEST_TIMEOUT);

afterAll(() => {
  child?.kill();
  stub?.close();
});

async function callTool(args) {
  const res = await fetch(`${baseUrl}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${MCP_TOKEN}` },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'tools/call',
      params: { name: 'xero_create_draft_invoice', arguments: args },
    }),
  });
  const payload = await res.json();
  return payload.result;
}

const GOOD_ARGS = {
  confirm: true,
  instruction: 'MC said: invoice Test Contact R100 for delivery, account 200',
  tenant_id: 't-1',
  contact_name: 'Test Contact',
  line_items: [{ description: 'Delivery', unit_amount: 100, account_code: '200' }],
};

describe('xero_create_draft_invoice guards', () => {
  it('refuses without confirm:true and makes no backend call', async () => {
    const before = backendRequests.length;
    const result = await callTool({ ...GOOD_ARGS, confirm: false });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('confirm');
    expect(backendRequests.length).toBe(before);
  });

  it('refuses without instruction and makes no backend call', async () => {
    const before = backendRequests.length;
    const result = await callTool({ ...GOOD_ARGS, instruction: '   ' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('instruction');
    expect(backendRequests.length).toBe(before);
  });

  it('posts a valid call to the create-draft endpoint and surfaces the audit trail', async () => {
    const before = backendRequests.length;
    const result = await callTool(GOOD_ARGS);
    expect(result.isError).toBe(false);
    expect(backendRequests.length).toBe(before + 1);
    const req = backendRequests.at(-1);
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/xero/data/invoices/create-draft/');
    expect(req.auth).toBe(`Bearer ${API_TOKEN}`);
    const sent = JSON.parse(req.body);
    expect(sent.instruction).toBe(GOOD_ARGS.instruction);
    expect(sent.line_items).toHaveLength(1);
    const text = result.content[0].text;
    expect(text).toContain('INV-0099');
    expect(text).toContain('write_log_id');
    expect(text).toContain('42');
  });
});
