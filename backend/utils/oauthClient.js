let cachedToken = null;
let tokenExpiresAt = 0;
let pendingRequest = null;

export async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  if (pendingRequest) return pendingRequest;

  pendingRequest = (async () => {
    const {
      OAUTH_TOKEN_URL,
      OAUTH_CLIENT_ID,
      OAUTH_CLIENT_SECRET,
      OAUTH_SCOPE = "ai:access"
    } = process.env;

    if (!OAUTH_TOKEN_URL || !OAUTH_CLIENT_ID || !OAUTH_CLIENT_SECRET) {
      throw new Error("OAuth client configuration is missing");
    }

    const credentials = Buffer.from(
      `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(OAUTH_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        scope: OAUTH_SCOPE
      }),
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`OAuth token request failed: HTTP ${response.status}`);
    }

    const data = await response.json();

    if (
      typeof data.access_token !== "string" ||
      !Number.isFinite(data.expires_in) ||
      data.expires_in <= 0
    ) {
      throw new Error("OAuth provider returned an invalid token response");
    }

    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + data.expires_in * 1000;

    return cachedToken;
  })();

  try {
    return await pendingRequest;
  } finally {
    pendingRequest = null;
  }
}
