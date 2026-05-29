import { defineCollection, z } from 'astro:content';

const films = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    genre: z.array(z.string()),
    type: z.string().optional(),
    synopsis: z.string(),
    videoUrl: z.string().optional(),
    poster: z.string().optional(),
    order: z.number().default(0),
    year: z.number().optional(),
  }),
});

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    date: z.string(),
    draft: z.boolean().default(false),
    excerpt: z.string().optional(),
  }),
});

const profile = defineCollection({
  type: 'content',
  schema: z.object({
    name: z.string(),
    tagline: z.string().optional(),
    headshot: z.string().optional(),
  }),
});

const inDevelopment = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    status: z.enum(['concept', 'development', 'pre-production', 'production']),
    logline: z.string(),
    genre: z.array(z.string()).optional(),
    type: z.string().optional(),
  }),
});

export const collections = { films, blog, profile, inDevelopment };
