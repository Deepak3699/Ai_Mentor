import assert from "node:assert/strict";
import { test } from "node:test";
import {
  requestSyllabus,
  SyllabusServiceError,
} from "../services/syllabusService.js";

const course = { title: "Biology", category: "Science" };
const response = (payload, ok = true) => ({ ok, json: async () => payload });

test("requests and returns a valid syllabus", async () => {
  let request;
  const data = { modules: [{ title: "Module 1", lessons: [] }] };

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
    /timed out/,
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
