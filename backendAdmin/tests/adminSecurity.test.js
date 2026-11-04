import { test } from "node:test";
import assert from "node:assert/strict";
import jwt from "jsonwebtoken";
import { protectAdmin } from "../middleware/adminAuthMiddleware.js";
import { adminLoginLimiter } from "../middleware/rateLimiter.js";
import { Admin } from "../models/index.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "fallback_secret";

test("adminAuthMiddleware revokes tokens issued before passwordChangedAt", async () => {
  const adminId = 999;
  const token = jwt.sign({ id: adminId }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
  const decoded = jwt.decode(token);

  // Mock Admin.findByPk
  const originalFindByPk = Admin.findByPk;
  Admin.findByPk = async () => ({
    id: adminId,
    email: "admin@test.com",
    role: "superadmin",
    status: "active",
    passwordChangedAt: new Date((decoded.iat + 10) * 1000), // changed after token issued
  });

  try {
    const req = {
      headers: {
        authorization: `Bearer ${token}`,
      },
    };
    let responseStatus = null;
    let responseJson = null;
    const res = {
      status(code) {
        responseStatus = code;
        return this;
      },
      json(data) {
        responseJson = data;
        return this;
      },
    };
    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    await protectAdmin(req, res, next);
    assert.equal(nextCalled, false);
    assert.equal(responseStatus, 401);
    assert.equal(responseJson.message, "Token revoked, please log in again");
  } finally {
    Admin.findByPk = originalFindByPk;
  }
});

test("adminLoginLimiter enforces rate limit after repeated requests", () => {
  const oldEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    let blocked = false;
    const req = {
      ip: "10.0.0.1",
      headers: {},
    };
    const res = {
      status(code) {
        if (code === 429) blocked = true;
        return this;
      },
      json() {
        return this;
      },
    };

    // 5 requests allowed
    for (let i = 0; i < 5; i++) {
      let nextCalled = false;
      adminLoginLimiter(req, res, () => {
        nextCalled = true;
      });
      assert.equal(nextCalled, true);
    }

    // 6th request should be blocked
    let nextCalled = false;
    adminLoginLimiter(req, res, () => {
      nextCalled = true;
    });
    assert.equal(nextCalled, false);
    assert.equal(blocked, true);
  } finally {
    process.env.NODE_ENV = oldEnv;
  }
});
