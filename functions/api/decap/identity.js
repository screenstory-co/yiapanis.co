// Cloudflare Pages Function: /api/decap/identity
// Bridges Clerk authentication to Decap CMS git-gateway
// Verifies Clerk session token, returns Decap-compatible identity

export async function onRequest(context) {
  const { request, env } = context;

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

  // Verify Clerk session token
  try {
    const clerkRes = await fetch(
      `https://sure-squid-67.clerk.accounts.dev/v1/session/${token}?_clerk_js_version=latest`,
      {
        headers: {
          Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        },
      }
    );

    if (!clerkRes.ok) {
      return new Response(JSON.stringify({ msg: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const session = await clerkRes.json();
    const userId = session.user_id;

    if (!userId) {
      return new Response(JSON.stringify({ msg: 'No user in session' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Fetch user details
    const userRes = await fetch(
      `https://sure-squid-67.clerk.accounts.dev/v1/users/${userId}?_clerk_js_version=latest`,
      {
        headers: {
          Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
        },
      }
    );

    if (!userRes.ok) {
      return new Response(JSON.stringify({ msg: 'User lookup failed' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const user = await userRes.json();
    const email = user.email_addresses?.[0]?.email_address || '';
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || email;

    // Decap CMS identity format — echo Clerk token back for gateway use
    const identity = {
      id: userId,
      email,
      user_metadata: { full_name: name },
      app_metadata: { roles: ['editor'] },
      token: token, // Decap stores this and sends as Bearer to git-gateway
    };

    return new Response(JSON.stringify(identity), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
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
