exports.handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
    if (!OPENROUTER_API_KEY) {
      return { statusCode: 500, body: JSON.stringify({ error: 'OpenRouter API key not configured' }) };
    }

    const requestBody = JSON.parse(event.body || '{}');
    const response = await fetch('https://openrouter.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENROUTER_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    const resBody = await response.text();
    return {
      statusCode: response.status,
      body: resBody,
      headers: { 'Content-Type': 'application/json' }
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
