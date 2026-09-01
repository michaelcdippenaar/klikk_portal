import fs from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';

const handoverPath = '/Users/mcdippenaar/ClaudProjects/klikk_financials_portal/HANDOVER-TO-CODEX.md';
const handover = await fs.readFile(handoverPath, 'utf8');
const loginMatch = handover.match(/Login:\s*`([^`]+)`\s*\/\s*`([^`]+)`/);

if (!loginMatch) {
  throw new Error('Could not resolve the documented audit login.');
}

const loginResponse = await fetch('https://console.8-bit.space/backend/api/auth/login/', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ username: loginMatch[1], password: loginMatch[2] }),
});

if (!loginResponse.ok) {
  throw new Error(`Audit login failed (${loginResponse.status}).`);
}

const loginPayload = await loginResponse.json();
const accessToken = loginPayload?.tokens?.access ?? loginPayload?.access;

if (!accessToken) {
  throw new Error('Audit login returned no access token.');
}

const corsHeaders = {
  'access-control-allow-origin': 'http://127.0.0.1:9000',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, HEAD, OPTIONS',
  'access-control-expose-headers': 'content-disposition, content-type',
  vary: 'Origin',
};

const server = http.createServer((request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders);
    response.end();
    return;
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { ...corsHeaders, 'content-type': 'application/json' });
    response.end(JSON.stringify({ detail: 'Audit proxy is read-only.' }));
    return;
  }

  const upstream = https.request({
    hostname: 'console.8-bit.space',
    port: 443,
    method: request.method,
    path: `/backend${request.url}`,
    headers: {
      accept: request.headers.accept ?? 'application/json',
      authorization: `Bearer ${accessToken}`,
      'user-agent': 'Klikk-audit-read-only-proxy/1.0',
    },
  }, (upstreamResponse) => {
    const headers = { ...upstreamResponse.headers, ...corsHeaders };
    delete headers['transfer-encoding'];
    response.writeHead(upstreamResponse.statusCode ?? 502, headers);
    upstreamResponse.pipe(response);
  });

  upstream.on('error', (error) => {
    response.writeHead(502, { ...corsHeaders, 'content-type': 'application/json' });
    response.end(JSON.stringify({ detail: error.message }));
  });

  upstream.end();
});

server.listen(8001, '127.0.0.1', () => {
  console.log('Read-only audit proxy listening on http://127.0.0.1:8001');
});
