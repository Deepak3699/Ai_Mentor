import { after, afterEach, before, test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "test-secret-for-contact-route";

const { default: express } = await import("express");
const { default: ContactMessage } = await import("../models/Contactmessage.js");
const { default: User } = await import("../models/User.js");
const { default: contactRoutes } = await import("../routes/contactus.js");

let server;
let baseUrl;

const { errorHandler, notFoundMiddleware } = await import("../middleware/errorMiddleware.js");

const originalCreate = ContactMessage.create;
const originalFindByPk = User.findByPk;
const originalConsoleError = console.error;

const validBody = {
  email: "test@example.com",
  subject: "Need Help",
  message: "This is a valid test message.",
};

const post = (body, token) => {
  const headers = { "Content-Type": "application/json" };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return fetch(baseUrl, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
};

before(async () => {
  const app = express();
  app.use(express.json());
  app.use("/api/contactus", contactRoutes);
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api/contactus`;
});

afterEach(() => {
  ContactMessage.create = originalCreate;
  User.findByPk = originalFindByPk;
  console.error = originalConsoleError;
});

after(async () => {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

test("anonymous submission stores userId as null", async () => {
  let saved;
  ContactMessage.create = async (data) => {
    saved = data;
    return { id: 1, ...data };
  };

  const res = await post(validBody);
  const data = await res.json();

  assert.equal(res.status, 201);
  assert.equal(data.success, true);
  assert.equal(saved.userId, null);
});

test("authenticated submission derives userId from verified token", async () => {
  const userId = 456;
  const token = jwt.sign({ id: userId }, process.env.JWT_SECRET);

  User.findByPk = async (id) => ({
    id,
    email: "authuser@example.com",
    isBlocked: false,
  });

  ContactMessage.create = async (data) => ({ id: 2, ...data });

  const res = await post(validBody, token);
  const data = await res.json();

  assert.equal(res.status, 201);
  assert.equal(data.data.userId, userId);
});

test("anonymous request cannot spoof userId in the body", async () => {
  let saved;
  ContactMessage.create = async (data) => {
    saved = data;
    return { id: 3, ...data };
  };

  const res = await post({ ...validBody, userId: 999 });

  assert.equal(res.status, 201);
  assert.equal(saved.userId, null);
});

test("authenticated request cannot override token identity with body userId", async () => {
  const token = jwt.sign({ id: 456 }, process.env.JWT_SECRET);

  User.findByPk = async (id) => ({
    id,
    email: "authuser@example.com",
    isBlocked: false,
  });

  let saved;
  ContactMessage.create = async (data) => {
    saved = data;
    return { id: 4, ...data };
  };

  const res = await post({ ...validBody, userId: 999 }, token);

  assert.equal(res.status, 201);
  assert.equal(saved.userId, 456);
});

test("invalid token returns 401", async () => {
  const res = await post(validBody, "invalid-token");
  assert.equal(res.status, 401);
});

test("missing email returns 400", async () => {
  const res = await post({
    subject: validBody.subject,
    message: validBody.message,
  });

  const data = await res.json();

  assert.equal(res.status, 400);
  assert.deepEqual(data, {
    success: false,
    error: {
      code: "BAD_REQUEST",
      message: "Email is required",
      details: [],
    },
  });
});

test("short subject and message are rejected before persistence", async () => {
  let creates = 0;
  ContactMessage.create = async () => {
    creates += 1;
  };

  let res = await post({ ...validBody, subject: "Hi" });

  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.message, "Subject must be at least 3 characters");
  res = await post({ email: "user@example.com", subject: "Help", message: "short" });
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.message, "Message must be at least 10 characters");
  assert.equal(creates, 0);
});

test("invalid email returns 400", async () => {
  const res = await post({ ...validBody, email: "invalid" });

  assert.equal(res.status, 400);
  assert.equal((await res.json()).success, false);
});

test("values are trimmed before saving", async () => {
  let saved;
  ContactMessage.create = async (data) => {
    saved = data;
    return { id: 5, ...data };
  };

  const res = await post({
    email: "  test@example.com  ",
    subject: "  Need Help  ",
    message: "  This is a valid test message.  ",
  });

  assert.equal(res.status, 201);
  assert.equal(saved.email, "test@example.com");
  assert.equal(saved.subject, "Need Help");
  assert.equal(saved.message, "This is a valid test message.");
});

test("persistence failure returns a safe 500 response", async () => {
  ContactMessage.create = async () => {
    throw new Error("database unavailable");
  };

  const original = console.error;
  console.error = () => {};

  try {
    const res = await post(validBody);
    const data = await res.json();

    assert.equal(res.status, 500);
    assert.deepEqual(data, {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        details: [],
      },
    });
  } finally {
    console.error = original;
  }
});
test("Sequelize validation errors are converted to a safe 400 response", async () => {
  ContactMessage.create = async () => {
    const error = new Error("validation failed");
    error.name = "SequelizeValidationError";
    error.errors = [{ message: "Please enter a valid email address" }];
    throw error;
  };

  const original = console.error;
  console.error = () => {};
  try {
    const res = await post({
      email: "invalid",
      subject: "Help",
      message: "A sufficiently long message",
    });
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Request validation failed",
        details: [{ message: "Please enter a valid email address", path: "email" }],
      },
    });
  } finally {
    console.error = original;
  }
});

test("contact route hides unexpected persistence failures", async () => {
  ContactMessage.create = async () => {
    throw new Error("database unavailable");
  };
  const original = console.error;
  console.error = () => {};
  try {
    const res = await post({
      email: "user@example.com",
      subject: "Help",
      message: "A sufficiently long message",
    });
    assert.equal(res.status, 500);
    assert.deepEqual(await res.json(), {
      success: false,
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Internal Server Error",
        details: [],
      },
    });
  } finally {
    console.error = original;
  }
});
