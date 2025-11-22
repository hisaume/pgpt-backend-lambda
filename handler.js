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
  // Origin domain:
  // CORS_ORIGIN_PROD when deployed for /prod (deployment stage)
  const allowedOrigin = process.env.CORS_ORIGIN;// || "*";
  const headers = {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Api-Key,Authorization",
  };
  if (event.httpMethod === "OPTIONS") {
    console.log("event.httpMethod === \"OPTIONS\"");
    return { statusCode: 200, headers, body: "" };
  }

  try {
    // I'm assuming Lambda Proxy Integration is used, so event.body needs parsing
    // but leaving in the alternative.
    console.log("Raw event:", JSON.stringify(event));
    let body;
    if (event.body) {
      try {
        body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      } catch (parseErr) {
        console.error("Failed to parse body:", parseErr);
        return {
          statusCode: 400,
          body: JSON.stringify({ error: "Invalid JSON payload: failed to parse body" }),
        };
      }
    } else {
      // Use event directly if body is not provided
      body = event;
    }
    /*
    try {
      if (typeof event.body === "string") {
        body = JSON.parse(event.body); // Parse if it's a string
      } else {
        body = event.body; // Use as-is if it's already an object
      }
    } catch (parseErr) {
      console.error("Failed to parse body:", parseErr);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Invalid JSON payload: failed to parse body" }),
      };
    }*/
    console.log("Parsed body:", body);

    // Logic
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
    console.log("No errors on the parse + format. Proceeding to OpenAI API call.");

    const apiKey = await getApiKey();
    const chatMessages = messages.map(m => ({ role: m.role, content: m.content }));

    const resp = await axios.post("https://api.openai.com/v1/chat/completions", {
      model, messages: chatMessages, temperature,
    }, {
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      timeout: 30000,
    });

    const data = resp.data;
    // Log the backend response
    console.log("OpenAI API Response:", JSON.stringify(data, null, 2));

    // Return the assistant's message to the frontend
    const assistant = data.choices?.[0]?.message || { content: "No response" };
    return { statusCode: 200, headers, body: JSON.stringify({ assistant }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: "Server error" }) };
  }
};
