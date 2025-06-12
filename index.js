const express = require('express');
const jsforce = require('jsforce');

const app = express();
app.use(express.json({ limit: '1mb' }));

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_REDIRECT_URI,
  SF_LOGIN_URL = 'https://login.salesforce.com',
  PORT = 8080
} = process.env;

// Redirect user to Salesforce OAuth login
app.get('/auth', (req, res) => {
  const oauth2 = new jsforce.OAuth2({
    loginUrl: SF_LOGIN_URL,
    clientId: SF_CLIENT_ID,
    clientSecret: SF_CLIENT_SECRET,
    redirectUri: SF_REDIRECT_URI
  });
  const authUrl = oauth2.getAuthorizationUrl({ scope: 'api refresh_token' });
  res.redirect(authUrl);
});

// OAuth2 callback
app.get('/oauth2/callback', async (req, res) => {
  const oauth2 = new jsforce.OAuth2({
    loginUrl: SF_LOGIN_URL,
    clientId: SF_CLIENT_ID,
    clientSecret: SF_CLIENT_SECRET,
    redirectUri: SF_REDIRECT_URI
  });

  const conn = new jsforce.Connection({ oauth2 });
  try {
    const userInfo = await conn.authorize(req.query.code);
    console.log('✅ Authorized user:', userInfo);
    // Ideally, store conn.accessToken and conn.refreshToken securely here
    res.send('Authentication successful. You may now close this tab.');
  } catch (err) {
    console.error('❌ OAuth callback error:', err);
    res.status(500).send('OAuth failed.');
  }
});

// MCP root metadata
app.get('/', (_, res) => {
  res.json({
    name: "Salesforce MCP",
    description: "Pulls Salesforce data via OAuth-based MCP connector",
    version: "1.0",
    auth: { type: "none" },
    endpoints: ["/tools/list", "/call/search", "/call/fetch"]
  });
});

app.listen(PORT, () => {
  console.log(`🚀 MCP OAuth server running on port ${PORT}`);
});
