exports.handler = async () => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL || '';
    const SUPABASE_ANON = process.env.SUPABASE_ANON || '';

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
        supabaseAnon: SUPABASE_ANON
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
