// Cloudflare Pages Function: /api/decap/git-gateway
// Proxies Decap CMS git operations to GitHub API
// Authenticated via Clerk session → GitHub token

const GITHUB_API = 'https://api.github.com';
const REPO = 'screenstory-co/yiapanis.co';

async function verifyClerkToken(token, env) {
  const res = await fetch(
    `https://sure-squid-67.clerk.accounts.dev/v1/session/${token}?_clerk_js_version=latest`,
    {
      headers: { Authorization: `Bearer ${env.CLERK_SECRET_KEY}` },
    }
  );
  if (!res.ok) return null;
  const session = await res.json();
  return session.user_id || null;
}

async function githubRequest(path, method, body, env) {
  const url = `${GITHUB_API}/repos/${REPO}${path}`;
  const headers = {
    Authorization: `token ${env.GITHUB_TOKEN}`,
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'screenstory-cms/1.0',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GitHub API ${res.status}: ${text}`);
  }

  return res;
}

export async function onRequest(context) {
  const { request, env } = context;

  // CORS
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      },
    });
  }

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ msg: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const token = authHeader.slice(7);
  const userId = await verifyClerkToken(token, env);
  if (!userId) {
    return new Response(JSON.stringify({ msg: 'Invalid session' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(request.url);
  const path = url.pathname.replace('/api/decap/git-gateway', '');

  try {
    let body = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      body = await request.json().catch(() => null);
    }

    const ghRes = await githubRequest(path, request.method, body, env);
    const ghBody = await ghRes.text();

    return new Response(ghBody || null, {
      status: ghRes.status,
      headers: {
        'Content-Type': ghRes.headers.get('Content-Type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ msg: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
