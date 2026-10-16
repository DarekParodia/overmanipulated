// Client error reports: `POST /api/client-errors` takes what the page saw when it broke, a render
// error caught by the error boundary, an uncaught error or an unhandled promise rejection. The
// server writes them to its log so the teacher can see them; nothing in a report names a player.
// The path is the pathname only: a query (room codes can live there) or a hash is never sent.
import { z } from 'zod';

/** Longest message kept; the client cuts a longer one before it sends. */
export const CLIENT_ERROR_MESSAGE_MAX = 500;
export const CLIENT_ERROR_STACK_MAX = 2000;
export const CLIENT_ERROR_PATH_MAX = 200;
export const CLIENT_ERROR_BUILD_MAX = 40;

export const clientErrorSourceSchema = z.enum(['boundary', 'window', 'promise']);

export const clientErrorReportSchema = z.object({
  message: z.string().max(CLIENT_ERROR_MESSAGE_MAX),
  stack: z.string().max(CLIENT_ERROR_STACK_MAX).optional(),
  source: clientErrorSourceSchema,
  path: z
    .string()
    .max(CLIENT_ERROR_PATH_MAX)
    .regex(/^\/[^?#]*$/, 'pathname only: starts with / and has no query or hash'),
  build: z.string().max(CLIENT_ERROR_BUILD_MAX).optional(),
});

export type ClientErrorSource = z.infer<typeof clientErrorSourceSchema>;
export type ClientErrorReport = z.infer<typeof clientErrorReportSchema>;
