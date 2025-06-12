const express = require('express');
const jsforce = require('jsforce');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Read from Railway env vars
const {
  SALESFORCE_USERNAME,
  SALESFORCE_PASSWORD,
  SALESFORCE_SECURITY_TOKEN,
  SALESFORCE_LOGIN_URL = 'https://login.salesforce.com',
  PORT = 8080,
} = process.env;

// Validate env vars
if (!SALESFORCE_USERNAME || !SALESFORCE_PASSWORD || !SALESFORCE_SECURITY_TOKEN) {
  console.error('❌ Missing required Salesforce environment variables');
  process.exit(1);
}

// Connect to Salesforce
const conn = new jsforce.Connection({ loginUrl: SALESFORCE_LOGIN_URL });
conn.login(SALESFORCE_USERNAME, SALESFORCE_PASSWORD + SALESFORCE_SECURITY_TOKEN, (err) => {
  if (err) {
    console.error('❌ Salesforce login failed:', err.message);
    process.exit(1);
  }
  console.log('✅ Connected to Salesforce');
});

// CORS (for debugging / flexibility)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Favicon
app.get('/favicon.ico', (_, res) => res.sendStatus(204));

// ChatGPT validation compatibility — POST /
app.post('/', (_, res) => {
  console.log('📨 POST / (ChatGPT validation)');
  res.status(200).json({
    name: "Salesforce MCP",
    description: "Custom connector to pull Salesforce data via MCP",
    version: "1.0",
    auth: { type: "none" },
    endpoints: ["/tools/list", "/call/search", "/call/fetch"]
  });
});

// Root metadata
app.get('/', (_, res) => {
  console.log('📥 GET /');
  res.json({
    name: "Salesforce MCP",
    description: "Custom connector to pull Salesforce data via MCP",
    version: "1.0",
    auth: { type: "none" },
    endpoints: ["/tools/list", "/call/search", "/call/fetch"]
  });
});

// Tool schema
app.get('/tools/list', (_, res) => {
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

// Search endpoint
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
    console.error("❌ /call/search error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Fetch endpoint
app.post('/call/fetch', async (req, res) => {
  const { id } = req.body;
  console.log("📄 POST /call/fetch", id);
  if (!id) return res.status(400).json({ error: "Missing 'id'" });

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
    console.error("❌ /call/fetch error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// Catch-all error
app.use((err, _, res, __) => {
  console.error("🔥 Unhandled error:", err.message);
  res.status(500).json({ error: "Unhandled server error" });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP server running on port ${PORT}`);
});
