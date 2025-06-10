import { z } from 'zod';

// Zod schema for the error response
export const ErrorResponseSchema = z.object({
  status: z.number(),
  message: z.string(),
});

export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
