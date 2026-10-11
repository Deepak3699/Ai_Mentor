import { test, before } from "node:test";
import assert from "node:assert/strict";
import AIVideo from "../models/AIVideo.js";

test("AI Job Metadata Persistence", async (t) => {
  before(async () => {
    AIVideo.findOne = async ({ where }) => {
      if (where.id === "test-job-id") {
        return {
          status: "completed",
          videoUrl: "http://cloudinary/test",
          transcriptName: "test.txt",
          jobId: "test-job-id",
          meta: {
            provider: "gemini",
            model: "gemini-2.5-flash",
            duration_ms: 1200,
            audio_seconds: 5.4,
            word_count: 50,
            timestamps: {
              queued_at: "2026-10-08T00:00:00Z",
              started_at: "2026-10-08T00:00:01Z",
              completed_at: "2026-10-08T00:00:02Z"
            }
          }
        };
      }
      return null;
    };
  });

  await t.test("should return metadata in cached ready status responses", async () => {
    const videoJob = await AIVideo.findOne({ where: { id: "test-job-id" } });
    
    assert.ok(videoJob.meta, "meta should exist");
    assert.equal(videoJob.meta.provider, "gemini");
    assert.equal(videoJob.meta.duration_ms, 1200);
    assert.equal(videoJob.meta.word_count, 50);
    assert.ok(videoJob.meta.timestamps.completed_at, "completed_at timestamp should exist");
  });
});
