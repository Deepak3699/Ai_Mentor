import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestSyllabus,
  SyllabusServiceError,
  validateSyllabusResponse,
} from "../services/syllabusService.js";

process.env.AI_SERVICE_KEY = "test-service-key";

const course = { title: "Biology", category: "Science" };
const response = (payload, ok = true) => ({ ok, json: async () => payload });

test("requests and returns a valid syllabus", async () => {
  let request;
  const data = {
    modules: [
      {
        title: "Module 1",
        lessons: [{ title: "Lesson 1", duration: "5 mins", type: "video" }],
      },
    ],
  };

  const result = await requestSyllabus(course, {
    serviceUrl: "http://provider.test/",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return response(data);
    },
  });

  assert.deepEqual(result, data);
  assert.equal(request.url, "http://provider.test/generate-syllabus");
  assert.equal(request.options.method, "POST");
  assert.deepEqual(JSON.parse(request.options.body), {
    course_title: "Biology",
    category: "Science",
  });
  assert.ok(request.options.signal instanceof AbortSignal);
});

test("reports provider failures as retryable service errors", async () => {
  await assert.rejects(
    requestSyllabus(course, {
      serviceUrl: "http://provider.test",
      fetchImpl: async () => response({}, false),
    }),
    SyllabusServiceError,
  );
});

test("aborts a stalled request at the configured timeout", async () => {
  await assert.rejects(
    requestSyllabus(course, {
      serviceUrl: "http://provider.test",
      timeoutMs: 5,
      fetchImpl: (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(new Error("aborted")), {
            once: true,
          });
        }),
    }),
    (error) => error instanceof SyllabusServiceError && error.code === "PROVIDER_TIMEOUT",
  );
});

test("maps connection refusal to a retryable service error", async () => {
  const error = new Error("connect failed");
  error.cause = { code: "ECONNREFUSED" };

  await assert.rejects(
    requestSyllabus(course, {
      serviceUrl: "http://127.0.0.1:1",
      fetchImpl: async () => {
        throw error;
      },
    }),
    SyllabusServiceError,
  );
});

test("classifies missing endpoint or credential as a non-retryable configuration error", async () => {
  for (const options of [
    { serviceUrl: "", serviceKey: "test-service-key" },
    { serviceUrl: "http://provider.test", serviceKey: " " },
  ]) {
    await assert.rejects(
      requestSyllabus(course, options),
      (error) =>
        error instanceof SyllabusServiceError &&
        error.code === "SERVICE_CONFIGURATION" &&
        error.retryable === false,
    );
  }
});

test("does not expose provider error text or credential in failures", async () => {
  const secret = "route-secret-should-never-leak";
  await assert.rejects(
    requestSyllabus(course, {
      serviceUrl: "http://provider.test",
      serviceKey: secret,
      fetchImpl: async () => {
        throw new Error(`provider rejected ${secret}`);
      },
    }),
    (error) => {
      assert.equal(error.code, "PROVIDER_UNAVAILABLE");
      assert.ok(!error.message.includes(secret));
      return true;
    },
  );
});

test("normalizes optional lesson fields to supported defaults", () => {
  assert.deepEqual(
    validateSyllabusResponse({
      modules: [{ title: "Module 1", lessons: [{ title: "Lesson 1" }] }],
    }),
    {
      modules: [
        {
          title: "Module 1",
          lessons: [{ title: "Lesson 1", duration: "5 mins", type: "video" }],
        },
      ],
    },
  );
});

test("rejects empty output, duplicate titles, unsupported types, and invalid lengths", () => {
  const invalidPayloads = [
    { modules: [] },
    { modules: [{ title: "Module", lessons: [] }] },
    {
      modules: [
        { title: "Duplicate", lessons: [{ title: "One" }] },
        { title: " duplicate ", lessons: [{ title: "Two" }] },
      ],
    },
    {
      modules: [
        {
          title: "Module",
          lessons: [{ title: "Duplicate" }, { title: " duplicate " }],
        },
      ],
    },
    {
      modules: [{ title: "Module", lessons: [{ title: "Lesson", type: "unknown" }] }],
    },
    {
      modules: [{ title: " ".repeat(121), lessons: [{ title: "Lesson" }] }],
    },
    {
      modules: [
        {
          title: "Module",
          lessons: [{ title: "Lesson", duration: "x".repeat(41) }],
        },
      ],
    },
  ];

  for (const payload of invalidPayloads) {
    assert.throws(
      () => validateSyllabusResponse(payload),
      (error) =>
        error instanceof SyllabusServiceError && error.code === "INVALID_PROVIDER_RESPONSE",
    );
  }
});

test("enforces module, lesson, and total lesson count limits", () => {
  const lesson = (index) => ({ title: `Lesson ${index}` });
  const module = (title, lessons) => ({ title, lessons });
  const maxModuleCount = Array.from({ length: 12 }, (_, index) =>
    module(`Module ${index}`, [lesson(1)]),
  );
  const tooManyModules = [...maxModuleCount, module("Module extra", [lesson(1)])];
  const tooManyPerModule = [
    module(
      "Module",
      Array.from({ length: 21 }, (_, i) => lesson(i)),
    ),
  ];
  const tooManyTotal = Array.from({ length: 7 }, (_, i) =>
    module(
      `Module ${i}`,
      Array.from({ length: 18 }, (_, j) => lesson(`${i}-${j}`)),
    ),
  );

  assert.equal(validateSyllabusResponse({ modules: maxModuleCount }).modules.length, 12);
  for (const modules of [tooManyModules, tooManyPerModule, tooManyTotal]) {
    assert.throws(
      () => validateSyllabusResponse({ modules }),
      (error) =>
        error instanceof SyllabusServiceError && error.code === "INVALID_PROVIDER_RESPONSE",
    );
  }
});
