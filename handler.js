const { default: axios } = require("axios");
const AWS = require("aws-sdk");

// OpenAI API Key retrieval from Secrets Manager
const getApiKey = async () => {
  if (process.env.OPENAI_API_KEY)
    return process.env.OPENAI_API_KEY;  // Local key for local debug with SAM

  const sm = new AWS.SecretsManager();
  const secret = await sm.getSecretValue({ SecretId: process.env.OPENAI_SECRET_ID }).promise();
  const secretsObj = JSON.parse(secret.SecretString);
  if (typeof secretsObj === 'object' && secretsObj.OPENAI_API_KEY) {
    return secretsObj.OPENAI_API_KEY;
  }
  throw new Error("Invalid secret format: OPENAI_API_KEY not found");
}

// Main
exports.handler = async (event) => {
  /*
  allowedOrigin
    Keep as CORS_ORIGIN unless creating a stable production version.
    Temporarily switch to CORS_ORIGIN_PROD when creating a stable version.
    Check also the frontend '.env' (/test for development, /prod for production).
  */
  const allowedOrigin = process.env.CORS_ORIGIN;
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
  };
  
  /*if (event.httpMethod === "OPTIONS") {
    console.log("event.httpMethod === 'OPTIONS'");
    return { statusCode: 200, headers, body: "" };
  }*/

  try {
    console.log("Raw event:", JSON.stringify(event));

    if (!event.body) {
      return {
        statusCode: 400, headers, body: JSON.stringify({ error: "Missing request body" })
      };
    }

    let body;
    try {
      body = JSON.parse(event.body);
    } catch (parseErr) {
      console.error(parseErr);
      return {
        statusCode: 400, headers, body: JSON.stringify({ error: "Invalid JSON payload" })
      };
    }

    //console.log("Parsed body:", body);

    const { threadId, messages, model = "gpt-4o-mini", temperature = 0.3 } = body;
    if (!threadId) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing threadId" }) };
    }
    if (!Array.isArray(messages)) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "messages must be an array" }) };
    }
    if (messages.length === 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "messages array cannot be empty" }) };
    }
    console.log("No errors on the parse + format.");

    // Retrieve API Key
    const apiKey = await getApiKey();
    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    // Query OpenAI API
    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model, messages: chatMessages, temperature,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 19500,
    });

    const data = resp.data;
    // Log the backend response
    console.log("OpenAI API Response:", JSON.stringify(data, null, 2));

    const assistant = data.choices?.[0]?.message || { role: "assistant", content: "No response" };
    return { statusCode: 200, headers, body: JSON.stringify({ assistant }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
