import { z } from "zod";

export const chatSchema = z.object({
  message: z
    .string({
      required_error: "Message is required",
      invalid_type_error: "Message must be a string",
    })
    .trim()
    .min(1, "Message is required")
    .max(1000, "Message cannot exceed 1000 characters"),
  history: z.unknown().optional(),
});

export const chatRequestSchema = chatSchema;
