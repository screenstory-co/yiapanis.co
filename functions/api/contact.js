// Cloudflare Pages Function: POST /api/contact
// Receives form submissions and emails them via Fastmail JMAP

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  // Parse form data
  const formData = await request.formData();
  const name = formData.get('name')?.toString().trim() || '';
  const email = formData.get('email')?.toString().trim() || '';
  const message = formData.get('message')?.toString().trim() || '';
  const gotcha = formData.get('_gotcha')?.toString().trim() || '';

  // Honeypot check
  if (gotcha) {
    return new Response('Bot detected', { status: 400 });
  }

  // Validation
  if (!name || !email || !message) {
    return new Response('Missing required fields', { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response('Invalid email', { status: 400 });
  }

  // Fastmail JMAP API
  const token = env.FASTMAIL_API_TOKEN;
  if (!token) {
    console.error('FASTMAIL_API_TOKEN not set');
    return new Response('Configuration error', { status: 500 });
  }

  try {
    // Get session info
    const sessionRes = await fetch('https://api.fastmail.com/jmap/session', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!sessionRes.ok) throw new Error('Fastmail session failed');
    const session = await sessionRes.json();
    const accountId = Object.values(session.primaryAccounts)[0];
    const apiUrl = session.apiUrl;

    // Send email
    const sendRes = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        using: ['urn:ietf:params:jmap:core', 'urn:ietf:params:jmap:mail', 'urn:ietf:params:jmap:submission'],
        methodCalls: [
          ['Identity/get', { accountId, ids: null }, '0'],
          ['Email/set', {
            accountId,
            create: {
              email: {
                mailboxIds: { [session.primaryAccounts['urn:ietf:params:jmap:mail']]: true },
                from: [{ email: session.username, name: 'yiapanis.co Contact Form' }],
                to: [{ email: 'demetris@yiapanis.co', name: 'Demetris Yiapanis' }],
                subject: `[Contact Form] ${name} (${email})`,
                textBody: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}\n\n---\nSent from yiapanis.co contact form.`
              }
            }
          }, '1'],
          ['EmailSubmission/set', {
            accountId,
            onSuccessUpdateEmail: { '#1': { mailboxIds: { Sent: true } } },
            create: {
              submit: {
                emailId: '#1',
                identityId: session.primaryAccounts['urn:ietf:params:jmap:mail']
              }
            }
          }, '2']
        ]
      })
    });

    if (!sendRes.ok) {
      const err = await sendRes.text();
      console.error('Fastmail send error:', err);
      throw new Error('Failed to send email');
    }

    // Redirect back to contact page with success
    return new Response(null, {
      status: 302,
      headers: { Location: '/contact?sent=1' }
    });

  } catch (err) {
    console.error('Contact form error:', err);
    return new Response('Failed to send message. Please try again later.', { status: 500 });
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
