import { z } from "zod";
import { passwordSchema } from "./authSchema.js";

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

export const updateProfileSchema = z.object({
  firstName: z.string().min(1, "First name is required").optional(),
  lastName: z.string().min(1, "Last name is required").optional(),
  email: z.string().email("Invalid email format").optional(),
  bio: z
    .string()
    .trim()
    .min(1, "Bio is required")
    .max(500, "Bio must be at most 500 characters")
    .optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});
export const purchaseCourseSchema = z.object({
  courseId: positiveIntId("Course ID"),
  // Accepted for backwards compatibility but ignored — the server uses the
  // authoritative course title from the database.
  courseTitle: z.string().optional(),
});

export const courseProgressSchema = z.object({
  courseId: positiveIntId("Course ID"),

  lessonData: z
    .object({
      lessonId: positiveIntId("Lesson ID"),
      data: z.any(),
    })
    .optional(),

  currentLesson: z
    .object({
      lessonId: positiveIntId("Lesson ID"),
      moduleTitle: z.string().optional(),
    })
    .optional(),

  completedLesson: z
    .object({
      lessonId: positiveIntId("Lesson ID"),
      completedAt: z.string().or(z.date()).optional(),
    })
    .optional(),
});

export const updateSettingsSchema = z.object({
  notifications: z
    .object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
    })
    .optional(),
  security: z
    .object({
      twoFactor: z.boolean().optional(),
    })
    .optional(),
  appearance: z
    .object({
      theme: z.enum(["light", "dark", "system"]).optional(),
    })
    .optional(),
});

export const removeCourseSchema = z.object({
  courseId: positiveIntId("Course ID"),
});
