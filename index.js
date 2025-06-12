const express = require('express');
const jsforce = require('jsforce');

// 🔐 Securely loaded from Railway environment variables
const SALESFORCE_USERNAME = process.env.SALESFORCE_USERNAME;
const SALESFORCE_PASSWORD = process.env.SALESFORCE_PASSWORD;
const SALESFORCE_SECURITY_TOKEN = process.env.SALESFORCE_SECURITY_TOKEN;

const PORT = process.env.PORT || 8080;

const app = express();
let server; // for graceful shutdown

// 🌍 Global CORS for MCP compatibility
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// 🧠 Salesforce connection
const conn = new jsforce.Connection();

// 🔐 Authenticate with Salesforce before starting the server
conn.login(
  SALESFORCE_USERNAME,
  SALESFORCE_PASSWORD + SALESFORCE_SECURITY_TOKEN,
  (err) => {
    if (err) {
      console.error('❌ Salesforce login failed:', err);
      process.exit(1);
    }
    console.log('✅ Connected to Salesforce');
    startServer();
  }
);

// 📡 Root metadata endpoint for MCP handshake
app.get('/', (req, res) => {
  res.status(200).json({
    name: "Salesforce MCP",
    description: "Custom connector to pull Salesforce data via MCP",
    version: "1.0",
    endpoints: ["/leads"]
  });
});

// 🩺 Health check
app.get('/health', (req, res) => {
  res.status(200).send('Salesforce MCP is healthy');
});

// 📥 /leads endpoint
app.get('/leads', async (req, res) => {
  try {
    const result = await conn.sobject('Lead')
      .find({}, { Id: 1, Name: 1, Company: 1, Email: 1 })
      .limit(5)
      .execute();

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error fetching leads:", err);
    res.status(500).send(err.toString());
  }
});

// 🚀 Start Express server AFTER Salesforce connection
function startServer() {
  server = app.listen(PORT, () => {
    console.log(`🚀 MCP server running on http://localhost:${PORT}`);
  });
}

// 🔁 Graceful shutdown (for Railway)
process.on('SIGTERM', () => {
  console.log('SIGTERM received: closing server...');
  if (server) server.close(() => {
    console.log('HTTP server closed.');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received: closing server...');
  if (server) server.close(() => {
    console.log('HTTP server closed.');
  });
});
