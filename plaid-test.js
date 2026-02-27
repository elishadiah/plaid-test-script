/**
 * plaid-test.js
 * -------------
 * Minimal Node.js script that simulates handling a Plaid Link redirect callback
 * from Chase (OAuth). Uses only built-in http module and plain JavaScript.
 *
 * HOW TO RUN:
 *   node plaid-test.js
 *
 * Server listens on http://localhost:3000 by default.
 *
 * ENDPOINTS:
 *   GET /plaid/callback?oauth_state_id=...&redirect_uri=...&status=...&nonce=...
 *   GET /logs  (returns last 5 request log entries)
 *
 * EXAMPLE QUERY STRINGS FOR /plaid/callback:
 *
 *   Success (valid state + matching nonce, status not delayed):
 *     http://localhost:3000/plaid/callback?oauth_state_id=valid-state-123&redirect_uri=https://app.example.com&status=success&nonce=valid-nonce-456
 *
 *   INCORRECT_OAUTH_NONCE (valid state but wrong nonce):
 *     http://localhost:3000/plaid/callback?oauth_state_id=valid-state-123&redirect_uri=https://app.example.com&status=success&nonce=wrong-nonce
 *
 *   Chase delayed approval:
 *     http://localhost:3000/plaid/callback?oauth_state_id=valid-state-123&redirect_uri=https://app.example.com&status=delayed&nonce=valid-nonce-456
 *
 *   Missing/malformed oauth_state_id (empty or missing):
 *     http://localhost:3000/plaid/callback?redirect_uri=https://app.example.com&status=success
 *     http://localhost:3000/plaid/callback?oauth_state_id=&redirect_uri=https://app.example.com&status=success
 *
 *   Generic error (unknown oauth_state_id, e.g. not in store):
 *     http://localhost:3000/plaid/callback?oauth_state_id=unknown-state&redirect_uri=https://app.example.com&status=success&nonce=any
 */

const http = require('http');

const PORT = process.env.PORT || 4000;

// Fake in-memory store: oauth_state_id -> { nonce }
const oauthStateStore = new Map([
  ['valid-state-123', { nonce: 'valid-nonce-456' }],
]);

// In-memory request log: { timestamp, queryParams, result }
const requestLog = [];

function parseQuery(url) {
  const idx = url.indexOf('?');
  if (idx === -1) return {};
  const qs = url.slice(idx + 1);
  return Object.fromEntries(
    qs.split('&').map((p) => {
      const eq = p.indexOf('=');
      const k = eq === -1 ? decodeURIComponent(p) : decodeURIComponent(p.slice(0, eq));
      const v = eq === -1 ? '' : decodeURIComponent(p.slice(eq + 1));
      return [k, v];
    })
  );
}

function send(res, statusCode, body) {
  const json = JSON.stringify(body);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
  });
  res.end(json);
}

function logRequest(queryParams, result) {
  requestLog.push({
    timestamp: new Date().toISOString(),
    queryParams: { ...queryParams },
    result,
  });
  // Keep only last 100 in memory; /logs returns last 5
  if (requestLog.length > 100) requestLog.shift();
}

function handlePlaidCallback(queryParams, res) {
  const oauth_state_id = queryParams.oauth_state_id;
  const redirect_uri = queryParams.redirect_uri;
  const status = queryParams.status;
  const nonce = queryParams.nonce;

  // 1. Missing or malformed oauth_state_id
  if (oauth_state_id == null || String(oauth_state_id).trim() === '') {
    const result = {
      statusCode: 400,
      body: {
        error: 'INVALID_OAUTH_STATE_ID',
        message: 'Missing or malformed oauth_state_id',
      },
    };
    logRequest(queryParams, result);
    send(res, 400, result.body);
    return;
  }

  // 2. Simulated delayed-approval scenario (Chase)
  if (status === 'delayed') {
    const result = {
      statusCode: 202,
      body: {
        error: 'CHASE_DELAYED_APPROVAL',
        message:
          'Chase is still processing your authorization. Please check back later or complete approval in the Chase app.',
      },
    };
    logRequest(queryParams, result);
    send(res, 202, result.body);
    return;
  }

  // 3. Unknown oauth_state_id (generic invalid state)
  const stored = oauthStateStore.get(oauth_state_id);
  if (!stored) {
    const result = {
      statusCode: 400,
      body: {
        error: 'INVALID_OAUTH_STATE',
        message: 'Invalid or expired oauth state',
      },
    };
    logRequest(queryParams, result);
    send(res, 400, result.body);
    return;
  }

  // 4. Nonce mismatch -> INCORRECT_OAUTH_NONCE
  if (nonce !== stored.nonce) {
    const result = {
      statusCode: 400,
      body: {
        error: 'INCORRECT_OAUTH_NONCE',
        message: 'OAuth nonce does not match the one stored for this state',
      },
    };
    logRequest(queryParams, result);
    send(res, 400, result.body);
    return;
  }

  // 5. Success
  const result = {
    statusCode: 200,
    body: {
      public_token: 'public-sandbox-mock-token-' + Date.now(),
      item_id: 'mock-item-' + Date.now(),
    },
  };
  logRequest(queryParams, result);
  send(res, 200, result.body);
}

function handleLogs(res) {
  const last5 = requestLog.slice(-5);
  send(res, 200, { count: last5.length, entries: last5 });
}

const server = http.createServer((req, res) => {
  const [path, search] = (req.url || '').split('?');
  const pathname = path || '/';
  const queryString = search ? '?' + search : '';
  const queryParams = parseQuery(req.url || '');

  if (req.method === 'GET' && pathname === '/plaid/callback') {
    handlePlaidCallback(queryParams, res);
    return;
  }

  if (req.method === 'GET' && pathname === '/logs') {
    handleLogs(res);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found', path: pathname }));
});

server.listen(PORT, () => {
  console.log('Plaid callback simulator listening on http://localhost:' + PORT);
  console.log('  GET /plaid/callback  - OAuth callback (see comments at top of file for examples)');
  console.log('  GET /logs            - Last 5 request log entries');
});
