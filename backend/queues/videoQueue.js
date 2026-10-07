import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import AIVideo from "../models/AIVideo.js";
dotenv.config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT || 6379,
};

export const videoQueue = process.env.NODE_ENV === "test" 
  ? { add: async () => ({ id: "test-job-id" }) } 
  : new Queue("video", {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 5000,
        },
      },
    });

// Adding a worker
let worker;
if (process.env.NODE_ENV !== "test") {
  worker = new Worker(
    "video",
    async (job) => {
      // Mark as processing
    await AIVideo.update(
      { status: "processing" },
      { where: { id: job.data.aiVideoId } }
    );

    const {
      courseTitle,
      lessonTitle,
      celebrity,
      userPreferences,
      aiVideoId
    } = job.data;

    const response = await fetch(`${AI_SERVICE_URL}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course: courseTitle,
        topic: lessonTitle,
        celebrity: celebrity,
        preferences: userPreferences || null,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`AI service error ${response.status}: ${errText}`);
    }

    const data = await response.json();
    
    // data contains { jobId: pythonJobId, status, filename, text_file, audio_file }
    // Update AIVideo with the Python service jobId and other info
    await AIVideo.update(
      {
        jobId: String(data.jobId),
        transcriptName: data.text_file || null,
      },
      { where: { id: aiVideoId } }
    );
    
    return data;
  },
  {
    connection,
  }
);

  worker.on("failed", async (job, err) => {
    console.error(`❌ Job ${job.id} failed:`, err.message);
    if (job && job.data && job.data.aiVideoId) {
      try {
          await AIVideo.update(
            { status: "failed", error: err.message },
            { where: { id: job.data.aiVideoId } }
          );
      } catch (dbErr) {
          console.error("Failed to update AIVideo status to failed:", dbErr);
      }
    }
  });
}