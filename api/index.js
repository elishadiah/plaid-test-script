/**
 * Vercel serverless handler for Plaid callback + logs.
 * Rewrites in vercel.json send /api/plaid/callback and /api/logs here.
 * Query params come from req.query (Vercel parses them) or from req.url.
 */

// Fake in-memory store: oauth_state_id -> { nonce }
const oauthStateStore = new Map([
  ['valid-state-123', { nonce: 'valid-nonce-456' }],
]);

// In-memory request log (per serverless instance; may reset between cold starts)
const requestLog = [];

function getQueryParams(req) {
  // Vercel populates req.query for serverless; fallback to parsing req.url
  let q = {};
  if (req.query && typeof req.query === 'object' && Object.keys(req.query).length > 0) {
    q = { ...req.query };
  } else {
    const url = req.url || '';
    const idx = url.indexOf('?');
    if (idx !== -1) {
      const qs = url.slice(idx + 1);
      q = Object.fromEntries(
        qs.split('&').map((p) => {
          const eq = p.indexOf('=');
          const k = eq === -1 ? decodeURIComponent(p) : decodeURIComponent(p.slice(0, eq));
          const v = eq === -1 ? '' : decodeURIComponent(p.slice(eq + 1));
          return [k, v];
        })
      );
    }
  }
  delete q.__route;
  return q;
}

function getRoute(req) {
  // Vercel rewrites add __route so we know which path was requested
  const q = req.query || {};
  const route = q.__route;
  if (route === 'plaid/callback' || route === 'logs') return route;
  const url = req.url || '';
  const path = url.split('?')[0] || '/';
  if (path.endsWith('/plaid/callback')) return 'plaid/callback';
  if (path.endsWith('/logs')) return 'logs';
  return path;
}

function logRequest(queryParams, result) {
  requestLog.push({
    timestamp: new Date().toISOString(),
    queryParams: { ...queryParams },
    result,
  });
  if (requestLog.length > 100) requestLog.shift();
}

function handlePlaidCallback(queryParams, res) {
  const oauth_state_id = queryParams.oauth_state_id;
  const status = queryParams.status;
  const nonce = queryParams.nonce;

  if (oauth_state_id == null || String(oauth_state_id).trim() === '') {
    const result = { statusCode: 400, body: { error: 'INVALID_OAUTH_STATE_ID', message: 'Missing or malformed oauth_state_id' } };
    logRequest(queryParams, result);
    res.status(400).json(result.body);
    return;
  }

  if (status === 'delayed') {
    const result = {
      statusCode: 202,
      body: {
        error: 'CHASE_DELAYED_APPROVAL',
        message: 'Chase is still processing your authorization. Please check back later or complete approval in the Chase app.',
      },
    };
    logRequest(queryParams, result);
    res.status(202).json(result.body);
    return;
  }

  const stored = oauthStateStore.get(oauth_state_id);
  if (!stored) {
    const result = { statusCode: 400, body: { error: 'INVALID_OAUTH_STATE', message: 'Invalid or expired oauth state' } };
    logRequest(queryParams, result);
    res.status(400).json(result.body);
    return;
  }

  if (nonce !== stored.nonce) {
    const result = {
      statusCode: 400,
      body: { error: 'INCORRECT_OAUTH_NONCE', message: 'OAuth nonce does not match the one stored for this state' },
    };
    logRequest(queryParams, result);
    res.status(400).json(result.body);
    return;
  }

  const result = {
    statusCode: 200,
    body: {
      public_token: 'public-sandbox-mock-token-' + Date.now(),
      item_id: 'mock-item-' + Date.now(),
    },
  };
  logRequest(queryParams, result);
  res.status(200).json(result.body);
}

function handleLogs(res) {
  const last5 = requestLog.slice(-5);
  res.status(200).json({ count: last5.length, entries: last5 });
}

module.exports = (req, res) => {
  const route = getRoute(req);
  const queryParams = getQueryParams(req);

  if (req.method === 'GET' && route === 'plaid/callback') {
    handlePlaidCallback(queryParams, res);
    return;
  }

  if (req.method === 'GET' && route === 'logs') {
    handleLogs(res);
    return;
  }

  res.status(404).json({ error: 'Not Found', path: route });
};
