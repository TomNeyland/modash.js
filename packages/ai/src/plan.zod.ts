/**
 * Zod schema for structured output from LLM
 * Defines the Plan interface with pipeline query (q), UI DSL (ui), and windowing (w)
 */

import { z } from 'zod';

export const Plan = z.object({
  v: z.literal('v1').default('v1'),
  q: z.string().max(100_000), // Mongo pipeline JSON string: `[{"$match":...}, ...]`
  ui: z.string().max(8_000),  // Ultra-compact UIDSL v1 string
  w: z.object({
    mode: z.enum(['b', 'u']).default('b'), // bounded | unbounded
    emitMs: z.number().int().min(10).max(5000).optional(),
    maxDocs: z.number().int().positive().optional()
  }).optional()
});

export type PlanType = z.infer<typeof Plan>;

/**
 * Windowing mode configuration
 */
export interface WindowingConfig {
  mode: 'b' | 'u'; // bounded or unbounded
  emitMs?: number; // emission interval in ms for streaming
  maxDocs?: number; // maximum documents to process
}

/**
 * Complete plan structure returned by LLM
 */
export interface StructuredPlan {
  v: 'v1';
  q: string; // MongoDB pipeline JSON string
  ui: string; // UIDSL string
  w?: WindowingConfig;
}