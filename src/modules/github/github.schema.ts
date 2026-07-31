import { z } from 'zod';

export const githubCallbackQuerySchema = z.object({
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
});

export const githubSyncBodySchema = z.object({
  repositoryId: z.string().uuid().optional(),
}).default({});

export type GithubCallbackQuery = z.infer<typeof githubCallbackQuerySchema>;
export type GithubSyncBody = z.infer<typeof githubSyncBodySchema>;
