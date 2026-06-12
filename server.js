const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const ENV_FILE = path.join(ROOT, '.env');
const EXAMPLE_ENV_FILE = path.join(ROOT, '.env.example');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.log(`ℹ️ ${filePath} not found`);
    return {};
  }

  const contents = fs.readFileSync(filePath, 'utf8');
  const values = {};
  const loadedKeys = [];
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
    const separatorIndex = trimmed.indexOf('=');
    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key) {
      values[key] = value;
      process.env[key] = value;
      loadedKeys.push(key);
    }
  }
  
  console.log(`✅ Loaded ${path.basename(filePath)}: ${loadedKeys.join(', ')}`);
  return values;
}

// Load .env first, then fallback to .env.example
console.log('\n📁 Loading environment variables...');
const ENV_VALUES = { ...loadEnvFile(EXAMPLE_ENV_FILE), ...loadEnvFile(ENV_FILE) };

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

    console.log('📨 OTP Request received:', { phone, email, otpCode: otpCode ? '***' : 'missing' });

    if (!otpCode) {
      return sendJson(res, 400, { error: 'Missing otpCode' });
    }

    if (phone) {
      const twoFactorApiKey = process.env.TWOFACTOR_API_KEY || ENV_VALUES.TWOFACTOR_API_KEY || '';
      console.log('🔑 Using TWOFACTOR_API_KEY:', twoFactorApiKey ? `${twoFactorApiKey.substring(0, 10)}...` : 'NOT FOUND');
      
      if (!twoFactorApiKey) {
        console.error('❌ TWOFACTOR_API_KEY not configured');
        return sendJson(res, 500, { error: 'TWOFACTOR_API_KEY is not configured in .env or .env.example' });
      }

      const digits = String(phone || '').replace(/\D/g, '');
      console.log('📱 Phone digits:', digits, 'length:', digits.length);
      
      if (!digits || digits.length < 10) {
        return sendJson(res, 400, { error: 'Invalid phone number - must be 10 digits' });
      }

      const twoFactorUrl = `https://2factor.in/API/V1/${twoFactorApiKey}/SMS/${digits}/${otpCode}`;
      console.log('🌐 Calling 2factor API...');
      
      const response = await fetch(twoFactorUrl, { method: 'GET' });
      const data = await response.json().catch(() => null);

      console.log('📡 2factor response:', { status: response.status, statusText: response.statusText, data });

      if (!response.ok || !data || data.Status !== 'Success') {
        const errorText = data?.Details || data?.Message || (await response.text());
        console.error('❌ 2factor API error:', { status: response.status, error: errorText });
        return sendJson(res, response.status || 500, { error: errorText || '2factor SMS failed' });
      }

      console.log('✅ SMS sent successfully');
      return sendJson(res, 200, { success: true, service: '2factor', details: data });
    }

    if (!email) {
      return sendJson(res, 400, { error: 'Missing email or phone' });
    }

    const resendApiKey = process.env.RESEND_API_KEY || ENV_VALUES.RESEND_API_KEY || '';
    console.log('🔑 Using RESEND_API_KEY:', resendApiKey ? '✓ Set' : '✗ Missing');
    
    if (!resendApiKey) {
      console.error('❌ RESEND_API_KEY not configured');
      return sendJson(res, 500, { error: 'RESEND_API_KEY is not configured in .env or .env.example' });
    }

    const fromEmail = requestFromEmail || process.env.FROM_EMAIL || ENV_VALUES.FROM_EMAIL || 'onboarding@resend.dev';
    const fromName = requestFromName || process.env.FROM_NAME || ENV_VALUES.FROM_NAME || 'LiquiFi';
    const mailSubject = subject || 'Your LiquiFi OTP Code';
    const mailBody = message || `Your LiquiFi OTP is: ${otpCode}\n\nThis OTP expires in ${expiryMinutes || 5} minutes. Do not share it with anyone.`;

    console.log('📧 Sending email OTP to:', email);
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

    console.log('📡 Resend API response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Resend API error:', { status: response.status, error: errorText });
      if (
        response.status === 403 &&
        /testing emails|verify a domain|sandbox/i.test(errorText)
      ) {
        console.log('ℹ️ Resend sandbox mode - returning demo OTP');
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

    console.log('✅ Email sent successfully');
    return sendJson(res, 200, { success: true, service: 'resend' });
  } catch (error) {
    console.error('❌ handleSendOtp error:', error.message);
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
  console.log(`\n✅ LiquiFi local server running at http://localhost:${PORT}`);
  console.log(`📁 Environment files loaded: .env.example + .env`);
  console.log(`\n🔧 Loaded environment variables:`);
  console.log(`  SUPABASE_URL: ${process.env.SUPABASE_URL ? '✓ Set' : '✗ Missing'}`);
  console.log(`  SUPABASE_ANON: ${process.env.SUPABASE_ANON ? '✓ Set' : '✗ Missing'}`);
  console.log(`  TWOFACTOR_API_KEY: ${process.env.TWOFACTOR_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`  RESEND_API_KEY: ${process.env.RESEND_API_KEY ? '✓ Set' : '✗ Missing'}`);
  console.log(`  SMS_ENABLED: ${process.env.SMS_ENABLED || 'true (default)'}`);
  console.log(`  SMS_PROVIDER: ${process.env.SMS_PROVIDER || '2factor (default)'}`);
  console.log(`\n📋 API Endpoints:`);
  console.log(`  POST /api/send-otp - Send OTP via SMS or Email`);
  console.log(`  GET /api/public-config - Get public configuration\n`);
});