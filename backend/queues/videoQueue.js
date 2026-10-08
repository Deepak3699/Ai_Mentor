import { Queue, Worker } from "bullmq";
import dotenv from "dotenv";
import AIVideo from "../models/AIVideo.js";

dotenv.config();

const AI_SERVICE_URL = process.env.AI_SERVICE_URL;
const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
};

let videoQueue;
let videoWorker;

const processVideoJob = async (job) => {
  await AIVideo.update(
    { status: "processing" },
    { where: { id: job.data.aiVideoId } },
  );

  const {
    courseTitle,
    lessonTitle,
    celebrity,
    userPreferences,
    aiVideoId,
  } = job.data;

  const response = await fetch(`${AI_SERVICE_URL}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      course: courseTitle,
      topic: lessonTitle,
      celebrity,
      preferences: userPreferences || null,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI service error ${response.status}: ${errText}`);
  }

  const data = await response.json();
  await AIVideo.update(
    {
      jobId: String(data.jobId),
      transcriptName: data.text_file || null,
    },
    { where: { id: aiVideoId } },
  );
  return data;
};

const ensureVideoWorker = () => {
  if (videoWorker) return videoWorker;

  videoWorker = new Worker("video", processVideoJob, { connection });
  videoWorker.on("failed", async (job, err) => {
    console.error(`❌ Job ${job?.id ?? "unknown"} failed:`, err.message);
    if (job?.data?.aiVideoId) {
      try {
        await AIVideo.update(
          { status: "failed", error: err.message },
          { where: { id: job.data.aiVideoId } },
        );
      } catch (dbErr) {
        console.error("Failed to update AIVideo status to failed:", dbErr);
      }
    }
  });
  return videoWorker;
};

export const getVideoQueue = () => {
  videoQueue ??= new Queue("video", {
    connection,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: "exponential", delay: 5000 },
    },
  });
  ensureVideoWorker();
  return videoQueue;
};

export const closeVideoQueue = async () => {
  const resources = [videoWorker, videoQueue].filter(Boolean);
  videoWorker = undefined;
  videoQueue = undefined;
  await Promise.all(resources.map((resource) => resource.close()));
};
