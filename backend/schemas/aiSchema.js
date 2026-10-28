import { z } from "zod";

const positiveIntId = (fieldName = "ID") =>
  z
    .union([
      z.string().trim().min(1, `${fieldName} is required`),
      z
        .number()
        .int(`${fieldName} must be an integer`)
        .positive(`${fieldName} must be a positive integer`),
    ])
    .refine(
      (value) => {
        const numericValue = Number(value);
        return Number.isInteger(numericValue) && numericValue > 0;
      },
      { message: `${fieldName} must be a positive integer` },
    )
    .transform((value) => Number(value));

export const generateVideoSchema = z.object({
  courseId: positiveIntId("Course ID"),
  lessonId: positiveIntId("Lesson ID"),
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
