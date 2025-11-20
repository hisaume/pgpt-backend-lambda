/*
    src/handler.js
*/

const { default: axios } = require("axios");
const AWS = require("aws-sdk");

async function getApiKey() {
  if (process.env.OPENAI_API_KEY)
    return process.env.OPENAI_API_KEY;

  const sm = new AWS.SecretsManager();
  const secret = await sm.getSecretValue({ SecretId: process.env.OPENAI_SECRET_ID }).promise();

  const val = secret.SecretString
    ? JSON.parse(secret.SecretString)
    : Buffer.from(secret.SecretBinary, 'base64').toString('ascii');

  if (typeof val === 'object' && val.OPENAI_API_KEY) {
    return val.OPENAI_API_KEY; // Ensure only the API key is returned
  }

  throw new Error("Invalid secret format: OPENAI_API_KEY not found");
}

exports.handler = async (event) => {
  const allowedOrigin = process.env.CORS_ORIGIN || "*";
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-api-key,Authorization",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { threadId, messages, model = "gpt-4o-mini", temperature = 0.3 } = body;
    if (!threadId || !Array.isArray(messages) || messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid payload" }) };
    }

    const apiKey = await getApiKey();

    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model, messages: chatMessages, temperature,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000,
    });

    const assistant = resp.data.choices?.[0]?.message;
    return { statusCode: 200, headers, body: JSON.stringify({ assistant }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
