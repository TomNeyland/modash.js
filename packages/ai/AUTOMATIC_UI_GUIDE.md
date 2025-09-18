# 🎨 Automatic UI/UX for aggo-ai

Transform natural language queries into beautiful terminal dashboards automatically using AI-powered UI generation.

## 🚀 Overview

The aggo-ai automatic UI/UX system combines:
- **Natural language processing** via OpenAI
- **MongoDB pipeline generation** for data queries  
- **Structured output generation** with Zod schemas
- **Beautiful terminal UI rendering** with adaptive layouts

Simply ask in plain English, and get both the data AND a gorgeous presentation.

## ✨ Key Features

### 🎯 Structured Output Generation
- Uses OpenAI's `zodResponseFormat` for type-safe LLM responses
- Generates both MongoDB pipelines AND UI instructions
- Includes reasoning for UI design choices

### 🎨 Adaptive Terminal UI
- **Table Layout**: Perfect for comparing structured data
- **Cards Layout**: Great for highlighting individual records
- **List Layout**: Ideal for simple ordered results  
- **Grid Layout**: Compact overviews of many items
- **Chart Layout**: Visual data representations (bars, etc.)

### 💡 Smart Presentation Logic
- Automatic layout selection based on data characteristics
- Professional color schemes and styling
- Currency, percentage, and number formatting
- AI-generated insights and summaries
- ASCII art titles and visual polish

## 🛠 Usage

### Basic Usage

```bash
# Automatic beautiful UI (default)
cat sales.jsonl | aggo-ai "revenue by product category"

# Traditional JSON output
cat sales.jsonl | aggo-ai "revenue by product category" --no-ui

# Raw JSON with pretty printing
cat sales.jsonl | aggo-ai "revenue by product category" --raw-output --pretty
```

### CLI Options

```bash
aggo-ai [query] [options]

Options:
  --no-ui          Disable automatic UI generation
  --raw-output     Output raw JSON without terminal formatting  
  --explain        Include explanation of pipeline and UI choices
  --show-pipeline  Show generated pipeline without executing
  --model <model>  Override default OpenAI model
  --file <path>    Read data from file instead of stdin
```

### Programmatic Usage

```typescript
import { aiQuery, TerminalUIRenderer } from 'aggo-ai';

const result = await aiQuery(documents, "top customers by revenue", {
  generateUI: true,
  includeExplanation: true
});

// Automatic rendering
if (result.uiInstructions) {
  const renderer = new TerminalUIRenderer(result.uiInstructions);
  await renderer.render(result.results);
}

// Or manual JSON output
console.log(JSON.stringify(result.results, null, 2));
```

## 🎨 UI Layouts

### Table Layout
Best for structured data comparisons:
```
┌─────────────┬─────────────┬──────────┐
│ Category    │ Revenue     │ Growth % │
├─────────────┼─────────────┼──────────┤
│ Electronics │    $87,500  │   15.0%  │
│ Fashion     │    $64,200  │    8.0%  │
└─────────────┴─────────────┴──────────┘
```

### Cards Layout  
Great for highlighting individual records:
```
╭─────────────────────────╮
│Category: Electronics    │
│Revenue: $87,500         │
│Growth: 15.0%            │
╰─────────────────────────╯
```

### List Layout
Perfect for simple ordered results:
```
1. Electronics
   Revenue: $87,500
   Growth: 15.0%
   
2. Fashion  
   Revenue: $64,200
   Growth: 8.0%
```

## 📊 Data Formatting

The system automatically formats data based on context:

- **Currency**: `$1,234.56` 
- **Percentages**: `15.2%`
- **Numbers**: `1,234,567`
- **Dates**: `12/25/2024`

## 🧠 AI-Generated Insights

The LLM provides contextual business insights:
```
💡 Key Insights:
  • Electronics leads with highest revenue despite lower volume
  • Home & Garden shows 22% growth - emerging opportunity  
  • Fashion has strong market presence with 156 products
```

## 🎯 Business Use Cases

### Sales Analysis
```bash
cat sales.jsonl | aggo-ai "quarterly revenue trends by region"
```

### Customer Analytics  
```bash  
cat customers.jsonl | aggo-ai "top 10 customers by lifetime value"
```

### Inventory Management
```bash
cat inventory.jsonl | aggo-ai "products with low stock levels"
```

### Performance Metrics
```bash
cat metrics.jsonl | aggo-ai "average response time by service"
```

## 🛠 Technical Architecture

### Structured Output Schema
```typescript
const StructuredOutputSchema = z.object({
  pipeline: z.array(z.record(z.unknown())), // MongoDB pipeline
  explanation: z.string().optional(),       // Pipeline explanation  
  ui: UIInstructionsSchema,                 // Terminal UI config
  reasoning: z.string().optional()          // UI design reasoning
});
```

### UI Instructions Schema
```typescript
const UIInstructionsSchema = z.object({
  title: z.string(),           // Dashboard title
  layout: z.enum(['table', 'cards', 'list', 'grid', 'chart']),
  styling: StylingSchema,      // Colors, borders, padding
  columns: z.array(ColumnSchema),  // Field definitions
  summary: SummarySchema,      // Aggregation section
  insights: z.array(z.string()), // Key insights
  footer: z.string()           // Footer message
});
```

## 🎨 Customization

### Custom Styling
```typescript
const customRenderer = new TerminalUIRenderer({
  ...uiInstructions,
  styling: {
    theme: 'minimal',
    colors: {
      header: 'green',
      values: 'white',
      highlight: 'yellow'
    }
  }
});
```

### Layout Override
```typescript
const tableRenderer = new TerminalUIRenderer({
  ...uiInstructions,
  layout: 'table'  // Force table layout
});
```

## 🚀 Performance

- **Schema inference**: ~100-200ms for 1000+ documents
- **LLM generation**: ~1-3s depending on model and complexity
- **UI rendering**: ~50-100ms for typical business dashboards
- **Memory efficient**: Streaming support for large datasets

## 🔧 Dependencies

### Required
- `openai ^4.67.3` - LLM integration
- `zod ^3.23.8` - Schema validation
- `aggo` - Query execution engine

### UI Libraries  
- `chalk` - Terminal colors
- `cli-table3` - Table rendering
- `boxen` - Card/box layouts
- `figlet` - ASCII art titles

## 📈 Examples

### E-commerce Dashboard
```bash
echo '{"category":"Electronics","revenue":25000,"orders":45}
{"category":"Books","revenue":8500,"orders":120}' | \
aggo-ai "revenue performance by category"
```

### Financial Metrics
```bash  
cat transactions.jsonl | aggo-ai "monthly spending trends with averages"
```

### System Monitoring
```bash
cat logs.jsonl | aggo-ai "error rates by service over time"
```

## 🎊 Getting Started

1. **Install aggo-ai**:
   ```bash
   npm install aggo-ai
   ```

2. **Set OpenAI API Key**:
   ```bash
   export OPENAI_API_KEY=your_api_key
   ```

3. **Try it out**:
   ```bash
   echo '{"name":"Alice","sales":1200}
   {"name":"Bob","sales":950}' | aggo-ai "sales performance"
   ```

The system will automatically generate a beautiful terminal dashboard based on your data and query!

## 🌟 Future Enhancements

- **Interactive mode** with drill-down capabilities
- **Export options** (HTML, PDF, PNG)
- **Custom chart types** (pie, line, scatter)
- **Real-time streaming** dashboard updates
- **Multi-language support** for international users

---

**Transform your data into insights with beautiful, AI-generated terminal dashboards!** 🚀📊✨