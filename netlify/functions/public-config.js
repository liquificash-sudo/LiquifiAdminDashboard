exports.handler = async () => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_ANON = process.env.SUPABASE_ANON || '';
    const SMS_ENABLED = process.env.SMS_ENABLED !== 'false';
    const SMS_PROVIDER = process.env.SMS_PROVIDER || '2factor';
    const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
    const TWOFACTOR_API_KEY = process.env.TWOFACTOR_API_KEY || '';

    if (!SUPABASE_URL || !SUPABASE_ANON) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Public Supabase config is not configured' })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        supabaseUrl: SUPABASE_URL,
        supabaseAnon: SUPABASE_ANON,
        smsEnabled: SMS_ENABLED,
        smsProvider: SMS_PROVIDER,
        sendOtpEndpoints: ['/api/send-otp'],
        resendApiKey: RESEND_API_KEY ? '***configured***' : null,
        twoFactorApiKey: TWOFACTOR_API_KEY ? '***configured***' : null
      }),
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store'
      }
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
