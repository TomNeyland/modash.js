/**
 * Zod schemas for structured AI outputs - query plan and presentation spec
 * Based on the TUI feature specification
 */

import { z } from 'zod';

// 1) Query plan (whatever your engine expects)
export const QueryPlan = z.object({
  dialect: z.enum(['mongo_agg', 'sql_like']).default('mongo_agg'),
  // For mongo_agg: pipeline array; for sql_like: text, etc.
  pipeline: z.array(z.unknown()).optional(),
  sql: z.string().optional(),
  // Optional: parameter hints, time windows, limits, sampling, etc.
  params: z.record(z.any()).optional(),
});

// 2) AggUI DSL (presentation spec)
export const AggUI = z.object({
  // high-level layout: rows/cols grid; percent/grow sizing
  layout: z.object({
    direction: z.enum(['row', 'column']).default('row'),
    children: z.array(
      z.object({
        id: z.string(),
        kind: z.enum([
          'container',
          'table',
          'kv',
          'metric',
          'list',
          'tree',
          'chart.line',
          'chart.bar',
          'sparkline',
          'json',
          'status',
        ]),
        // layout props
        width: z.union([z.number(), z.string()]).optional(), // 0.0-1.0 or "50%"
        height: z.union([z.number(), z.string()]).optional(),
        grow: z.number().optional(),
        title: z.string().optional(),
        border: z.boolean().default(true),
        // data binding
        bind: z
          .object({
            // JSONPath-like; relative to the final query result object
            path: z.string().default('$'),
            // optional column spec for tables
            columns: z
              .array(
                z.object({
                  key: z.string(),
                  label: z.string().optional(),
                  align: z.enum(['left', 'right', 'center']).optional(),
                  width: z.number().optional(),
                })
              )
              .optional(),
            // chart-specific
            x: z.string().optional(),
            y: z.union([z.string(), z.array(z.string())]).optional(),
          })
          .optional(),
        // formatting & thresholds
        fmt: z
          .object({
            number: z.string().optional(), // e.g. "0,0.00" or "pct:2"
            datetime: z.string().optional(), // "fromNow", "iso", …
            colorRules: z
              .array(
                z.object({
                  when: z.string(), // expr like "value > 0.95"
                  color: z.string(), // "red", "#ff0", "ansi256:202"
                })
              )
              .optional(),
            truncate: z.number().optional(),
          })
          .optional(),
        // nested containers
        children: z.any().optional(),
      })
    ),
  }),
  // keybindings, themes, and small-screen fallbacks
  ux: z
    .object({
      keys: z.record(z.string(), z.string()).optional(), // e.g. {"q":"quit","f":"toggle-filter"}
      theme: z.enum(['auto', 'light', 'dark']).default('auto'),
      smallScreenFallback: z.enum(['table', 'list', 'json']).default('table'),
    })
    .optional(),
});

// 3) Full structured output
export const NL2QueryAndUI = z.object({
  intent: z.string(), // short: "top_k_by_country"
  query_plan: QueryPlan,
  presentation_spec: AggUI,
});

// Export types for TypeScript usage
export type QueryPlanType = z.infer<typeof QueryPlan>;
export type AggUIType = z.infer<typeof AggUI>;
export type NL2QueryAndUIType = z.infer<typeof NL2QueryAndUI>;

// Widget-specific types for better type safety
export type WidgetKind = z.infer<typeof AggUI>['layout']['children'][0]['kind'];
export type LayoutDirection = z.infer<typeof AggUI>['layout']['direction'];
export type ColumnAlignment = z.infer<
  typeof AggUI
>['layout']['children'][0]['bind']['columns'][0]['align'];

// Utility type for individual widgets
export type Widget = z.infer<typeof AggUI>['layout']['children'][0];