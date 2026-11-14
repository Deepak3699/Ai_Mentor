const { test } = require("node:test");
const assert = require("node:assert/strict");

let testId = 0;

async function loadClient() {
  return import(`../utils/oauthClient.js?test=${++testId}`);
}

function configure() {
  process.env.OAUTH_TOKEN_URL = "https://issuer.example/token";
  process.env.OAUTH_CLIENT_ID = "test-client";
  process.env.OAUTH_CLIENT_SECRET = "test-secret";
  process.env.OAUTH_SCOPE = "ai:access";
}

test("fetches and caches access token", async (t) => {
  configure();
  let calls = 0;

  global.fetch = async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({ access_token: "test-token", expires_in: 3600 }),
    };
  };
  t.after(() => delete global.fetch);

  const { getAccessToken } = await loadClient();

  assert.equal(await getAccessToken(), "test-token");
  assert.equal(await getAccessToken(), "test-token");
  assert.equal(calls, 1);
});

test("rejects missing OAuth configuration", async () => {
  delete process.env.OAUTH_TOKEN_URL;
  delete process.env.OAUTH_CLIENT_ID;
  delete process.env.OAUTH_CLIENT_SECRET;

  const { getAccessToken } = await loadClient();

  await assert.rejects(getAccessToken(), /configuration is missing/);
});

test("rejects unsuccessful token response", async (t) => {
  configure();

  global.fetch = async () => ({ ok: false, status: 401 });
  t.after(() => delete global.fetch);

  const { getAccessToken } = await loadClient();

  await assert.rejects(getAccessToken(), /HTTP 401/);
});

test("shares simultaneous token requests", async (t) => {
  configure();
  let calls = 0;

  global.fetch = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return {
      ok: true,
      json: async () => ({ access_token: "shared-token", expires_in: 3600 }),
    };
  };
  t.after(() => delete global.fetch);

  const { getAccessToken } = await loadClient();

  const results = await Promise.all([getAccessToken(), getAccessToken(), getAccessToken()]);

  assert.deepEqual(results, ["shared-token", "shared-token", "shared-token"]);
  assert.equal(calls, 1);
});
