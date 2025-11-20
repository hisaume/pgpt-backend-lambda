(async () => {
  try {
    const apiKey = await getApiKey();
    console.log("API Key:", apiKey);
  } catch (err) {
    console.error("Error retrieving API key:", err);
  }
})();
