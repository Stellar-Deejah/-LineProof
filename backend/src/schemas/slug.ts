import { z } from 'zod';

/**
 * Zod schema for queue route param IDs (slugs).
 * Validates that the slug contains only lowercase alphanumeric characters
 * and hyphens, is at least 1 character, and at most 120 characters.
 */
export const SlugSchema = z.string().min(1).max(120).regex(/^[a-z0-9-]+$/, {
  message: 'Invalid slug format. Must be a lowercase alphanumeric string with hyphens (a-z, 0-9, -).',
});

export type Slug = z.infer<typeof SlugSchema>;
