import { z } from "zod";

// Optional text fields: the clients send "" for fields the user left empty.
const optionalText = (max, label) =>
  z.string().max(max, `${label} cannot exceed ${max} characters`).optional().nullable();

export const createReportSchema = z.object({
  reportType: z
    .string({ error: "Report type is required" })
    .trim()
    .min(1, "Report type is required")
    .max(100, "Report type cannot exceed 100 characters"),
  subType: optionalText(100, "Sub type"),
  description: z
    .string({ error: "Description is required" })
    .trim()
    .min(1, "Description is required")
    .max(5000, "Description cannot exceed 5000 characters"),
  courseName: optionalText(255, "Course name"),
  email: z
    .string()
    .max(255, "Email cannot exceed 255 characters")
    .refine((value) => value === "" || z.email().safeParse(value).success, {
      message: "Email must be a valid email address",
    })
    .optional()
    .nullable(),
  phone: optionalText(30, "Phone"),
});
