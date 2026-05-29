// Cloudflare Pages Function: POST /api/contact
// Sends email via SMTP over cloudflare:sockets (zero dependencies)

import { connect } from 'cloudflare:sockets';

class SmtpReader {
  constructor(socket) {
    this.reader = socket.readable.getReader();
    this.decoder = new TextDecoder();
    this.buffer = '';
  }

  async nextLine() {
    while (true) {
      const idx = this.buffer.indexOf('\r\n');
      if (idx !== -1) {
        const line = this.buffer.slice(0, idx);
        this.buffer = this.buffer.slice(idx + 2);
        return line;
      }
      const { value, done } = await this.reader.read();
      if (done) {
        const line = this.buffer;
        this.buffer = '';
        return line || null;
      }
      this.buffer += this.decoder.decode(value, { stream: true });
    }
  }

  async readResponse() {
    const lines = [];
    while (true) {
      const line = await this.nextLine();
      if (line === null) throw new Error('SMTP connection closed unexpectedly');
      lines.push(line);
      // Last line of a response has a space after the 3-digit code
      if (line.length >= 4 && line[3] === ' ') {
        return { code: parseInt(line.slice(0, 3), 10), lines };
      }
    }
  }

  close() {
    this.reader.releaseLock();
  }
}

function assertOk(res, expected = null) {
  if (expected !== null && res.code !== expected) {
    throw new Error(`SMTP error: ${res.code} — ${res.lines.join('\n')}`);
  }
  if (res.code >= 400) {
    throw new Error(`SMTP error: ${res.code} — ${res.lines.join('\n')}`);
  }
}

function utf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin);
}

async function sendSmtpMail({ host, port, user, pass, from, to, subject, textBody }) {
  const encoder = new TextEncoder();
  const socket = connect({ hostname: host, port }, { secureTransport: 'on' });
  const reader = new SmtpReader(socket);
  const writer = socket.writable.getWriter();

  try {
    // Greeting
    assertOk(await reader.readResponse(), 220);

    // EHLO
    writer.write(encoder.encode(`EHLO yiapanis-co.pages.dev\r\n`));
    assertOk(await reader.readResponse(), 250);

    // AUTH LOGIN
    writer.write(encoder.encode('AUTH LOGIN\r\n'));
    assertOk(await reader.readResponse(), 334);

    writer.write(encoder.encode(utf8ToBase64(user) + '\r\n'));
    assertOk(await reader.readResponse(), 334);

    writer.write(encoder.encode(utf8ToBase64(pass) + '\r\n'));
    assertOk(await reader.readResponse(), 235);

    // Envelope
    writer.write(encoder.encode(`MAIL FROM:<${from}>\r\n`));
    assertOk(await reader.readResponse(), 250);

    writer.write(encoder.encode(`RCPT TO:<${to}>\r\n`));
    assertOk(await reader.readResponse(), 250);

    // DATA
    writer.write(encoder.encode('DATA\r\n'));
    assertOk(await reader.readResponse(), 354);

    const now = new Date().toUTCString();
    const msgId = `${Date.now()}.${Math.random().toString(36).slice(2)}@yiapanis.co`;
    const bodyB64 = utf8ToBase64(textBody);

    const mail = [
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
      `Date: ${now}`,
      `Message-Id: <${msgId}>`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subject}`,
      '',
      bodyB64,
      ''
    ].join('\r\n') + '\r\n.\r\n';

    writer.write(encoder.encode(mail));
    assertOk(await reader.readResponse(), 250);

    // QUIT
    writer.write(encoder.encode('QUIT\r\n'));
    await reader.readResponse();

  } finally {
    reader.close();
    await writer.close();
    await socket.close();
  }
}

export async function onRequestPost(context) {
  const request = context.request;
  const env = context.env;

  // Extract and clean form data
  const formData = await request.formData();
  const name  = (formData.get('name')  || '').toString().trim();
  const email = (formData.get('email') || '').toString().trim();
  const msg   = (formData.get('message') || '').toString().trim();
  const gotcha = (formData.get('_gotcha') || '').toString().trim();

  // Honeypot
  if (gotcha) {
    return new Response('Bot detected', { status: 400 });
  }

  // Validation
  if (!name || !email || !msg) {
    return new Response('Missing required fields', { status: 400 });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response('Invalid email', { status: 400 });
  }

  const smtpUser = env.SMTP_USER;
  const smtpPass = env.SMTP_PASS;
  const fromEmail = env.FROM_EMAIL || 'hello@screenstory.co';

  if (!smtpUser || !smtpPass) {
    console.error('SMTP_USER or SMTP_PASS not set in environment');
    // Don't expose config details to user
    return new Response('Failed to send message. Please try again later.', { status: 500 });
  }

  const subject = `[Contact Form] ${name} (${email})`;
  const body = `Name: ${name}\nEmail: ${email}\n\nMessage:\n${msg}\n\n---\nSent from yiapanis.co contact form.`;

  try {
    await sendSmtpMail({
      host: 'smtp.fastmail.com',
      port: 465,
      user: smtpUser,
      pass: smtpPass,
      from: fromEmail,
      to: 'demetris@yiapanis.co',
      subject,
      textBody: body
    });

    return new Response(null, {
      status: 302,
      headers: { Location: '/contact?sent=1' }
    });

  } catch (err) {
    console.error('Contact form SMTP error:', err);
    return new Response('Failed to send message. Please try again later.', { status: 500 });
  }
}

export async function onRequest(context) {
  if (context.request.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  return onRequestPost(context);
}
