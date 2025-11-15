/**
 * Zod schemas for structured output from LLM
 * Defines the UI presentation instructions that the LLM can generate
 */

import { z } from 'zod';

/**
 * Color options for terminal styling
 */
export const ColorSchema = z.enum([
  'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
  'gray', 'grey', 'blackBright', 'redBright', 'greenBright', 'yellowBright',
  'blueBright', 'magentaBright', 'cyanBright', 'whiteBright'
]);

/**
 * Layout types supported by the terminal UI renderer
 */
export const LayoutSchema = z.enum(['table', 'cards', 'list', 'grid', 'chart']);

/**
 * Text alignment options
 */
export const AlignmentSchema = z.enum(['left', 'center', 'right']);

/**
 * Data formatting options
 */
export const FormatSchema = z.enum(['currency', 'number', 'percentage', 'date', 'text']);

/**
 * Column definition for table/grid layouts
 */
export const ColumnSchema = z.object({
  field: z.string().describe('Field name from query results'),
  label: z.string().describe('Display label for the column'),
  width: z.number().min(5).max(50).nullable().describe('Column width in characters'),
  align: AlignmentSchema.nullable().describe('Text alignment'),
  format: FormatSchema.nullable().describe('Data formatting type'),
  highlight: z.boolean().nullable().describe('Whether to highlight this column')
});

/**
 * Summary section configuration
 */
export const SummarySchema = z.object({
  show: z.boolean().describe('Whether to show summary section'),
  title: z.string().nullable().describe('Custom title for summary section'),
  fields: z.array(z.string()).describe('Fields to include in summary'),
  operations: z.array(z.enum(['sum', 'avg', 'count', 'min', 'max'])).describe('Operations to perform on each field')
});

/**
 * Styling configuration for the UI
 */
export const StylingSchema = z.object({
  theme: z.enum(['modern', 'classic', 'minimal', 'colorful']).nullable(),
  colors: z.object({
    header: ColorSchema.nullable(),
    values: ColorSchema.nullable(),
    highlight: ColorSchema.nullable(),
    border: ColorSchema.nullable(),
    summary: ColorSchema.nullable()
  }).nullable(),
  borders: z.boolean().nullable().describe('Whether to show borders'),
  padding: z.boolean().nullable().describe('Whether to add padding'),
  compact: z.boolean().nullable().describe('Use compact layout')
});

/**
 * Chart configuration for data visualization
 */
export const ChartSchema = z.object({
  type: z.enum(['bar', 'line', 'pie']).describe('Chart type'),
  xField: z.string().describe('Field for X-axis'),
  yField: z.string().describe('Field for Y-axis'),
  title: z.string().nullable().describe('Chart title'),
  showValues: z.boolean().nullable().describe('Show values on chart'),
  width: z.number().min(20).max(120).nullable().describe('Chart width in characters'),
  height: z.number().min(5).max(30).nullable().describe('Chart height in rows')
});

/**
 * Complete UI instructions schema for terminal presentation
 */
export const UIInstructionsSchema = z.object({
  title: z.string().describe('Main title for the display'),
  subtitle: z.string().nullable().describe('Optional subtitle'),
  layout: LayoutSchema.describe('Layout type for displaying results'),
  styling: StylingSchema.nullable().describe('Visual styling configuration'),
  columns: z.array(ColumnSchema).nullable().describe('Column definitions for table/grid layouts'),
  summary: SummarySchema.nullable().describe('Summary section configuration'),
  chart: ChartSchema.nullable().describe('Chart configuration for visualization'),
  insights: z.array(z.string()).nullable().describe('Key insights to highlight'),
  footer: z.string().nullable().describe('Optional footer message')
});

/**
 * Complete structured output schema that combines query and presentation
 */
export const StructuredOutputSchema = z.object({
  pipeline: z.string().describe('MongoDB aggregation pipeline as JSON string'),
  explanation: z.string().nullable().describe('Explanation of the pipeline logic'),
  ui: UIInstructionsSchema.describe('Terminal UI presentation instructions'),
  reasoning: z.string().nullable().describe('Reasoning behind UI choices')
});

// Export types
export type Color = z.infer<typeof ColorSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type Alignment = z.infer<typeof AlignmentSchema>;
export type Format = z.infer<typeof FormatSchema>;
export type Column = z.infer<typeof ColumnSchema>;
export type Summary = z.infer<typeof SummarySchema>;
export type Styling = z.infer<typeof StylingSchema>;
export type Chart = z.infer<typeof ChartSchema>;
export type UIInstructions = z.infer<typeof UIInstructionsSchema>;
export type StructuredOutput = z.infer<typeof StructuredOutputSchema>;