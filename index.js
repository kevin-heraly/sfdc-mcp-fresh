const express = require('express');
const jsforce = require('jsforce');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Salesforce credentials from environment variables
const SALESFORCE_USERNAME = process.env.SALESFORCE_USERNAME;
const SALESFORCE_PASSWORD = process.env.SALESFORCE_PASSWORD;
const SALESFORCE_SECURITY_TOKEN = process.env.SALESFORCE_SECURITY_TOKEN;
const PORT = process.env.PORT || 8080;

const conn = new jsforce.Connection();

// Authenticate with Salesforce
conn.login(SALESFORCE_USERNAME, SALESFORCE_PASSWORD + SALESFORCE_SECURITY_TOKEN, (err) => {
  if (err) {
    console.error('Salesforce login failed:', err);
    process.exit(1);
  }
  console.log('✅ Connected to Salesforce');
});

// CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Suppress favicon 404s
app.get('/favicon.ico', (_, res) => res.sendStatus(204));

// ✅ POST / now returns metadata just like GET / — required for AIP validation
app.post('/', (req, res) => {
  console.log("📨 Received POST / from ChatGPT validation");
  res.status(200).json({
    name: "Salesforce MCP",
    description: "Custom connector to pull Salesforce data via MCP",
    version: "1.0",
    auth: { type: "none" },
    endpoints: ["/tools/list", "/call/search", "/call/fetch"]
  });
});

// Root metadata endpoint
app.get('/', (req, res) => {
  console.log("📥 GET /");
  res.json({
    name: "Salesforce MCP",
    description: "Custom connector to pull Salesforce data via MCP",
    version: "1.0",
    auth: { type: "none" },
    endpoints: ["/tools/list", "/call/search", "/call/fetch"]
  });
});

// Health
app.get('/health', (_, res) => res.send('Salesforce MCP is healthy'));

// MCP: Tool list
app.get('/tools/list', (req, res) => {
  console.log("📥 GET /tools/list");
  res.json({
    tools: [
      {
        name: "search",
        description: "Searches for leads using the provided query string.",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query." }
          },
          required: ["query"]
        },
        output_schema: {
          type: "object",
          properties: {
            results: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  title: { type: "string" },
                  text: { type: "string" },
                  url: { type: ["string", "null"] }
                },
                required: ["id", "title", "text"]
              }
            }
          },
          required: ["results"]
        }
      },
      {
        name: "fetch",
        description: "Retrieves detailed content for a specific lead identified by the given ID.",
        input_schema: {
          type: "object",
          properties: {
            id: { type: "string" }
          },
          required: ["id"]
        },
        output_schema: {
          type: "object",
          properties: {
            id: { type: "string" },
            title: { type: "string" },
            text: { type: "string" },
            url: { type: ["string", "null"] },
            metadata: {
              type: ["object", "null"],
              additionalProperties: { type: "string" }
            }
          },
          required: ["id", "title", "text"]
        }
      }
    ]
  });
});

// MCP: Search
app.post('/call/search', async (req, res) => {
  const { query } = req.body;
  console.log("🔍 POST /call/search", query);
  try {
    const leads = await conn.sobject('Lead')
      .find({ Name: { $like: `%${query}%` } }, { Id: 1, Name: 1, Company: 1, Email: 1 })
      .limit(5)
      .execute();

    const results = leads.map(lead => ({
      id: lead.Id,
      title: lead.Name,
      text: `Company: ${lead.Company}, Email: ${lead.Email}`,
      url: null
    }));

    res.json({ results });
  } catch (err) {
    console.error("❌ /call/search error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// MCP: Fetch
app.post('/call/fetch', async (req, res) => {
  const { id } = req.body;
  console.log("📄 POST /call/fetch", id);
  if (!id) return res.status(400).json({ error: "Missing 'id' in request body" });

  try {
    const lead = await conn.sobject('Lead').retrieve(id);
    res.json({
      id: lead.Id,
      title: lead.Name,
      text: `Lead: ${lead.Name}, Company: ${lead.Company}, Email: ${lead.Email}`,
      url: null,
      metadata: {
        Company: lead.Company || '',
        Email: lead.Email || '',
        Status: lead.Status || '',
        Phone: lead.Phone || ''
      }
    });
  } catch (err) {
    console.error("❌ /call/fetch error:", err);
    res.status(500).json({ error: err.toString() });
  }
});

// Global error catcher
app.use((err, req, res, next) => {
  console.error("🔥 Unhandled error:", err);
  res.status(500).json({ error: "Unhandled server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP server running on port ${PORT}`);
});
