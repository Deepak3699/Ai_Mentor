import { z } from "zod";

export const generateVideoSchema = z.object({
  courseId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  lessonId: z.union([z.string(), z.number()]).transform((val) => Number(val)),
  celebrity: z.string().min(1, "Celebrity name is required"),
  voice_id: z.string().optional(),
  speech_rate: z.string().optional(),
  speech_pitch: z.string().optional(),
});

export const generateFlashcardsSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  lessonId: z.coerce.number().int().positive(),
  transcript: z.string().trim().min(1).max(30000),
  count: z.coerce.number().int().min(5).max(10).default(5),
});

export const updateFlashcardMasterySchema = z.object({
  mastered: z.boolean(),
});


export const explainCodeSchema = z.object({
  code: z.string().trim().min(1, "Code is required").max(20000),
  language: z.string().trim().min(1, "Programming language is required").max(50),
  mode: z.enum(["explain", "debug", "optimize"]),
});