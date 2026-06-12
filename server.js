const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const EXAMPLE_ENV_FILE = path.join(ROOT, '.env.example');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};

  const contents = fs.readFileSync(filePath, 'utf8');
  const values = {};
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      values[key] = value;
      process.env[key] = value;
    }
  }

  return values;
}

const ENV_VALUES = loadEnvFile(EXAMPLE_ENV_FILE);

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(body));
}

function sendText(res, statusCode, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.ico': 'image/x-icon'
  };
  return map[ext] || 'application/octet-stream';
}

async function readRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function readConfig() {
  return {
    supabaseUrl: ENV_VALUES.SUPABASE_URL || process.env.SUPABASE_URL || '',
    supabaseAnon: ENV_VALUES.SUPABASE_ANON || process.env.SUPABASE_ANON || '',
    sendOtpEndpoints: ['/api/send-otp'],
    smsEnabled: true,
    smsProvider: '2factor'
  };
}

function resolveFromEnv(primaryKey, fallbackKey, fallbackValue = '') {
  return process.env[primaryKey] || process.env[fallbackKey] || fallbackValue;
}

async function handleSendOtp(req, res) {
  if (req.method !== 'POST') {
    return sendJson(res, 405, { error: 'Method Not Allowed' });
  }

  try {
    const {
      email,
      phone,
      otpCode,
      expiryMinutes,
      subject,
      message,
      fromEmail: requestFromEmail,
      fromName: requestFromName
    } = await readRequestBody(req);

    if (!otpCode) {
      return sendJson(res, 400, { error: 'Missing otpCode' });
    }

    if (phone) {
      const twoFactorApiKey = resolveFromEnv('TWOFACTOR_API_KEY', 'TWOFACTOR_API_KEY', '');
      if (!twoFactorApiKey) {
        return sendJson(res, 500, { error: 'TWOFACTOR_API_KEY is not configured in .env.example' });
      }

      const digits = String(phone || '').replace(/\D/g, '');
      if (!digits || digits.length < 10) {
        return sendJson(res, 400, { error: 'Invalid phone number' });
      }

      const twoFactorUrl = `https://2factor.in/API/V1/${twoFactorApiKey}/SMS/${digits}/${otpCode}`;
      const response = await fetch(twoFactorUrl, { method: 'GET' });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data || data.Status !== 'Success') {
        const errorText = data?.Details || data?.Message || (await response.text());
        return sendJson(res, response.status || 500, { error: errorText || '2factor SMS failed' });
      }

      return sendJson(res, 200, { success: true, service: '2factor', details: data });
    }

    if (!email) {
      return sendJson(res, 400, { error: 'Missing email or phone' });
    }

    const resendApiKey = resolveFromEnv('RESEND_API_KEY', 'RESEND_API_KEY', '');
    if (!resendApiKey) {
      return sendJson(res, 500, { error: 'RESEND_API_KEY is not configured in .env.example' });
    }

    const fromEmail = requestFromEmail || resolveFromEnv('FROM_EMAIL', 'FROM_EMAIL', 'onboarding@resend.dev');
    const fromName = requestFromName || resolveFromEnv('FROM_NAME', 'FROM_NAME', 'LiquiFi');
    const mailSubject = subject || 'Your LiquiFi OTP Code';
    const mailBody = message || `Your LiquiFi OTP is: ${otpCode}\n\nThis OTP expires in ${expiryMinutes || 5} minutes. Do not share it with anyone.`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: `${fromName} <${fromEmail}>`,
        to: email,
        subject: mailSubject,
        text: mailBody,
        html: mailBody.replace(/\n/g, '<br/>')
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (
        response.status === 403 &&
        /testing emails|verify a domain|sandbox/i.test(errorText)
      ) {
        return sendJson(res, 200, {
          success: true,
          service: 'resend-sandbox',
          devFallback: true,
          otpCode,
          note: errorText
        });
      }

      return sendJson(res, response.status, { error: errorText });
    }

    return sendJson(res, 200, { success: true, service: 'resend' });
  } catch (error) {
    return sendJson(res, 500, { error: error.message });
  }
}

function serveStatic(req, res, pathname) {
  const requested = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.normalize(path.join(ROOT, requested));

  if (!filePath.startsWith(ROOT)) {
    return sendText(res, 403, 'Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (path.extname(requested)) {
        sendText(res, 404, 'Not Found');
        return;
      }

      const fallback = path.join(ROOT, 'index.html');
      fs.readFile(fallback, (fallbackError, fallbackData) => {
        if (fallbackError) {
          sendText(res, 404, 'Not Found');
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(fallbackData);
      });
      return;
    }

    res.writeHead(200, { 'Content-Type': getMimeType(filePath) });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/api/send-otp') {
    await handleSendOtp(req, res);
    return;
  }

  if (requestUrl.pathname === '/api/public-config') {
    try {
      sendJson(res, 200, readConfig());
    } catch (error) {
      sendJson(res, 500, { error: error.message });
    }
    return;
  }

  serveStatic(req, res, requestUrl.pathname);
});

server.listen(PORT, () => {
  console.log(`LiquiFi local server running at http://localhost:${PORT}`);
  console.log(`Using env source: ${EXAMPLE_ENV_FILE}`);
});