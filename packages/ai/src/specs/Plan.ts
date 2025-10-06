/**
 * Zod schemas for structured output (query + presentation)
 * Single LLM response includes both MongoDB pipeline and UI specification
 */

import { z } from "zod";

const JsonPath = z.string().describe("JSONPath like $.items[*].name");

const TableCol = z.object({
  header: z.string(),
  path: JsonPath,            // where to read from each row
  width: z.number().optional(), // char width hint
  align: z.enum(["left","right","center"]).optional(),
});

const Component = z.discriminatedUnion("type", [
  z.object({ 
    type: z.literal("table"),
    id: z.string(), 
    from: JsonPath,
    columns: z.array(TableCol),
    sort: z.object({ path: JsonPath, dir: z.enum(["asc","desc"]) }).optional(),
    paginate: z.object({ size: z.number().min(5).max(1000) }).optional()
  }),
  z.object({ 
    type: z.literal("list"),
    id: z.string(), 
    from: JsonPath,
    template: z.string().describe("e.g. '{name} — {status}' using paths")
  }),
  z.object({ 
    type: z.literal("tree"),
    id: z.string(), 
    from: JsonPath,
    label: JsonPath, 
    children: z.string().describe("path to children array") 
  }),
  z.object({ 
    type: z.literal("stat"),
    id: z.string(), 
    label: z.string(),
    value: JsonPath, 
    unit: z.string().optional() 
  }),
  z.object({ 
    type: z.literal("barchart"),
    id: z.string(), 
    from: JsonPath,
    x: JsonPath, 
    y: JsonPath 
  }),
  z.object({ 
    type: z.literal("sparkline"),
    id: z.string(), 
    from: JsonPath 
  }),
  z.object({ 
    type: z.literal("cards"),
    id: z.string(), 
    from: JsonPath,
    fields: z.array(z.object({ label: z.string(), path: JsonPath })) 
  }),
  z.object({ 
    type: z.literal("json"),
    id: z.string(), 
    from: JsonPath, 
    style: z.enum(["compact","pretty"]).optional() 
  }),
  z.object({ 
    type: z.literal("tabs"),
    id: z.string(), 
    tabs: z.array(z.object({ title: z.string(), child: z.any() })) 
  }),
  z.object({ 
    type: z.literal("grid"),
    id: z.string(), 
    direction: z.enum(["row","column"]).default("row"),
    gap: z.number().optional(), 
    children: z.array(z.any()) 
  })
]);

export const UISpec = z.object({
  title: z.string().optional(),
  layout: Component,                   // root component (grid/tabs/…)
  bindings: z.record(JsonPath).optional(), // optional named sources
  interactions: z.object({
    // simple things: pagination keys, tab switch, filter input
    enableSearch: z.boolean().optional(),
    enablePagination: z.boolean().optional()
  }).optional(),
  theme: z.object({
    accent: z.string().optional(),
    border: z.enum(["none","single","double","round"]).optional()
  }).optional(),
});

export const QuerySpec = z.object({
  // Mongo-like pipeline or filter/sort/limit; keep tight to what you support
  pipeline: z.array(z.record(z.any())).min(1),
  windowing: z.object({ 
    mode: z.enum(["bounded","unbounded"]),
    emitMs: z.number().optional(),
    maxDocs: z.number().optional() 
  }).optional()
});

export const Plan = z.object({
  query: QuerySpec,
  uiSpec: UISpec,
  hints: z.object({
    primaryKey: z.string().optional(),  // for stable row id
    expectedRows: z.number().optional()
  }).optional()
});

// Export types for TypeScript
export type JsonPathType = z.infer<typeof JsonPath>;
export type TableColType = z.infer<typeof TableCol>;
export type ComponentType = z.infer<typeof Component>;
export type UISpecType = z.infer<typeof UISpec>;
export type QuerySpecType = z.infer<typeof QuerySpec>;
export type PlanType = z.infer<typeof Plan>;