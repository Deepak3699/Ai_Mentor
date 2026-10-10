import { z } from "zod";

export const generateVideoSchema = z.object({
  courseId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  lessonId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  celebrity: z.string().min(1, "Celebrity name is required"),
  voice_id: z.string().optional(),
  speech_rate: z.string().optional(),
  speech_pitch: z.string().optional(),
});

export const generateQuizSchema = z.object({
  courseId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  lessonId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
});

export const submitQuizSchema = z.object({
  courseId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  lessonId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  quizSessionId: z.string().min(1, "Quiz session ID is required"),
  answers: z.array(z.number().int().min(0).max(3)).length(4),
});
