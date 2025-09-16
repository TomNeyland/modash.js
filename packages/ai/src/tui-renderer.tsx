/**
 * TUI Renderer - Converts presentation specs into beautiful Terminal UI
 * Uses react-blessed + neo-blessed + blessed-contrib stack
 */

import React, { useState, useEffect } from 'react';
import { AggUIType, Widget } from './schemas.js';
import { evaluateJSONPath, formatValue, applyColorRules } from './tui-utils.js';
import chalk from 'chalk';

// Dynamic imports for TUI libraries to avoid build issues
let blessed: any = null;
let contrib: any = null;
let createBlessedRenderer: any = null;

async function loadTUILibraries() {
  if (!blessed) {
    blessed = (await import('neo-blessed')).default;
  }
  if (!contrib) {
    contrib = (await import('blessed-contrib')).default;
  }
  if (!createBlessedRenderer) {
    const reactBlessed = await import('react-blessed');
    createBlessedRenderer = reactBlessed.createBlessedRenderer;
  }
  return { blessed, contrib, createBlessedRenderer };
}
import Table from 'cli-table3';

export interface TUIRendererProps {
  result: any; // Query execution result
  spec: AggUIType; // Presentation specification
  onKeyPress?: (key: string) => void;
  streaming?: boolean;
}

/**
 * Main TUI Application Component
 */
export function TUIApp({ result, spec, onKeyPress, streaming = false }: TUIRendererProps) {
  const [data, setData] = useState(result);
  const [refreshCount, setRefreshCount] = useState(0);

  // Handle streaming updates
  useEffect(() => {
    if (streaming) {
      const interval = setInterval(() => {
        setRefreshCount(count => count + 1);
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [streaming]);

  // Handle key bindings from spec
  useEffect(() => {
    if (spec.ux?.keys && onKeyPress) {
      Object.entries(spec.ux.keys).forEach(([key, action]) => {
        // Set up key handlers based on action
        if (action === 'quit') {
          onKeyPress(key);
        }
      });
    }
  }, [spec.ux?.keys, onKeyPress]);

  return (
    <element>
      <Layout spec={spec.layout} data={data} refreshCount={refreshCount} />
    </element>
  );
}

/**
 * Layout Component - Handles row/column layout
 */
function Layout({ spec, data, refreshCount }: {
  spec: AggUIType['layout'];
  data: any;
  refreshCount: number;
}) {
  const isRow = spec.direction === 'row';
  
  return (
    <box width="100%" height="100%" style={{ border: { type: 'line' } }}>
      {spec.children.map((child, index) => (
        <WidgetRenderer
          key={child.id || index}
          widget={child}
          data={data}
          index={index}
          totalChildren={spec.children.length}
          parentDirection={spec.direction}
          refreshCount={refreshCount}
        />
      ))}
    </box>
  );
}

/**
 * Widget Renderer - Renders individual widgets based on their type
 */
function WidgetRenderer({ 
  widget, 
  data, 
  index, 
  totalChildren, 
  parentDirection,
  refreshCount 
}: {
  widget: Widget;
  data: any;
  index: number;
  totalChildren: number;
  parentDirection: 'row' | 'column';
  refreshCount: number;
}) {
  // Calculate positioning based on parent direction and widget properties
  const calculatePosition = () => {
    if (parentDirection === 'row') {
      // Horizontal layout
      const defaultWidth = `${Math.floor(100 / totalChildren)}%`;
      const width = widget.width || defaultWidth;
      const left = `${Math.floor((100 / totalChildren) * index)}%`;
      
      return {
        left,
        top: '0%',
        width: typeof width === 'number' ? `${width * 100}%` : width,
        height: widget.height || '100%',
      };
    } else {
      // Vertical layout
      const defaultHeight = `${Math.floor(100 / totalChildren)}%`;
      const height = widget.height || defaultHeight;
      const top = `${Math.floor((100 / totalChildren) * index)}%`;
      
      return {
        left: '0%',
        top,
        width: widget.width || '100%',
        height: typeof height === 'number' ? `${height * 100}%` : height,
      };
    }
  };

  const position = calculatePosition();
  const boundData = widget.bind ? evaluateJSONPath(data, widget.bind.path) : data;

  // Common box properties
  const boxProps = {
    ...position,
    border: widget.border !== false ? { type: 'line' } : undefined,
    label: widget.title,
    style: {
      border: { fg: 'cyan' },
      label: { fg: 'white' },
    },
  };

  switch (widget.kind) {
    case 'table':
      return <TableWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'chart.bar':
      return <BarChartWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'chart.line':
      return <LineChartWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'metric':
      return <MetricWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'kv':
      return <KeyValueWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'list':
      return <ListWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'json':
      return <JSONWidget {...boxProps} data={boundData} widget={widget} />;
    
    case 'status':
      return <StatusWidget {...boxProps} data={boundData} widget={widget} refreshCount={refreshCount} />;
    
    default:
      return <box {...boxProps}>Unsupported widget: {widget.kind}</box>;
  }
}

/**
 * Table Widget using blessed-contrib
 */
function TableWidget({ data, widget, ...props }: any) {
  if (!Array.isArray(data)) {
    return <box {...props}>Invalid data for table widget</box>;
  }

  const columns = widget.bind?.columns || [];
  let headers: string[] = [];
  let rows: string[][] = [];

  if (columns.length > 0) {
    // Use specified columns
    headers = columns.map((col: any) => col.label || col.key);
    rows = data.map((item: any) => 
      columns.map((col: any) => {
        const value = item[col.key];
        return formatValue(value, widget.fmt);
      })
    );
  } else {
    // Auto-detect columns from data
    if (data.length > 0) {
      headers = Object.keys(data[0]);
      rows = data.map((item: any) => 
        headers.map(key => formatValue(item[key], widget.fmt))
      );
    }
  }

  return (
    <contrib:table
      {...props}
      keys={true}
      columnSpacing={1}
      columnWidth={headers.map(() => Math.max(10, Math.floor(80 / headers.length)))}
      data={{ headers, data: rows }}
    />
  );
}

/**
 * Bar Chart Widget
 */
function BarChartWidget({ data, widget, ...props }: any) {
  if (!Array.isArray(data) || !widget.bind?.x || !widget.bind?.y) {
    return <box {...props}>Invalid data for bar chart</box>;
  }

  const xField = widget.bind.x;
  const yField = widget.bind.y;

  const labels = data.map((item: any) => String(item[xField]));
  const values = data.map((item: any) => Number(item[yField]) || 0);

  return (
    <contrib:bar
      {...props}
      barWidth={6}
      barSpacing={2}
      xOffset={2}
      maxHeight={10}
      data={{ titles: labels, data: values }}
    />
  );
}

/**
 * Line Chart Widget
 */
function LineChartWidget({ data, widget, ...props }: any) {
  if (!Array.isArray(data) || !widget.bind?.x || !widget.bind?.y) {
    return <box {...props}>Invalid data for line chart</box>;
  }

  const xField = widget.bind.x;
  const yField = widget.bind.y;

  const chartData = {
    title: widget.title || 'Line Chart',
    x: data.map((item: any) => String(item[xField])),
    y: data.map((item: any) => Number(item[yField]) || 0),
  };

  return (
    <contrib:line
      {...props}
      showNthLabel={5}
      showLegend={true}
      legend={{ width: 10 }}
      data={[chartData]}
    />
  );
}

/**
 * Metric Widget - Shows single values with formatting
 */
function MetricWidget({ data, widget, ...props }: any) {
  const value = Array.isArray(data) ? data[0] : data;
  const displayValue = formatValue(value, widget.fmt);
  const color = applyColorRules(value, widget.fmt?.colorRules);

  return (
    <box {...props}>
      <text
        content={displayValue}
        style={{ fg: color }}
        align="center"
        valign="middle"
      />
    </box>
  );
}

/**
 * Key-Value Widget
 */
function KeyValueWidget({ data, widget, ...props }: any) {
  if (!data || typeof data !== 'object') {
    return <box {...props}>Invalid data for key-value widget</box>;
  }

  const content = Object.entries(data)
    .map(([key, value]) => `${key}: ${formatValue(value, widget.fmt)}`)
    .join('\n');

  return <box {...props} content={content} />;
}

/**
 * List Widget
 */
function ListWidget({ data, widget, ...props }: any) {
  if (!Array.isArray(data)) {
    return <box {...props}>Invalid data for list widget</box>;
  }

  const content = data
    .map(item => formatValue(item, widget.fmt))
    .join('\n');

  return <box {...props} content={content} scrollable={true} />;
}

/**
 * JSON Widget
 */
function JSONWidget({ data, widget, ...props }: any) {
  const content = JSON.stringify(data, null, 2);
  return <box {...props} content={content} scrollable={true} />;
}

/**
 * Status Widget - Shows system status with refresh indicators
 */
function StatusWidget({ data, widget, refreshCount, ...props }: any) {
  const timestamp = new Date().toLocaleTimeString();
  const content = `Status: ${formatValue(data, widget.fmt)}\nLast Update: ${timestamp}\nRefresh: ${refreshCount}`;
  
  return <box {...props} content={content} />;
}

/**
 * Creates and manages the TUI screen
 */
export class TUIManager {
  private screen: any;
  private render: any;
  private libraries: any = null;

  constructor() {
    // Screen and render will be initialized in renderTUI
  }

  /**
   * Initialize TUI libraries and screen
   */
  private async initializeTUI() {
    if (!this.libraries) {
      this.libraries = await loadTUILibraries();
    }
    
    if (!this.screen) {
      this.screen = this.libraries.blessed.screen({
        smartCSR: true,
        title: 'aggo-ai TUI',
        dockBorders: true,
        fullUnicode: true,
      });

      this.render = this.libraries.createBlessedRenderer(this.libraries.blessed);

      // Handle quit keys
      this.screen.key(['q', 'C-c', 'escape'], () => {
        this.cleanup();
        process.exit(0);
      });
    }
  }

  /**
   * Renders the TUI with given result and spec
   */
  async renderTUI(result: any, spec: AggUIType, streaming = false): Promise<void> {
    try {
      await this.initializeTUI();
      
      this.render(
        React.createElement(TUIApp, { 
          result, 
          spec, 
          streaming,
          onKeyPress: (key) => {
            if (key === 'q' || key === 'escape') {
              this.cleanup();
              process.exit(0);
            }
          }
        }), 
        this.screen
      );
    } catch (error) {
      console.error('TUI rendering error:', error);
      this.fallbackToTable(result, spec);
    }
  }

  /**
   * Fallback to simple table output for unsupported terminals
   */
  private fallbackToTable(result: any, spec: AggUIType): void {
    console.log('\n🖥️  Terminal UI not supported, falling back to table view:\n');
    
    if (Array.isArray(result)) {
      const table = new Table({
        head: Object.keys(result[0] || {}),
        style: { head: ['cyan'] }
      });

      result.forEach(row => {
        table.push(Object.values(row).map(v => String(v)));
      });

      console.log(table.toString());
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n💡 For best experience, use a terminal with full Unicode and color support');
    this.cleanup();
  }

  /**
   * Updates the display with new data (for streaming)
   */
  updateDisplay(result: any): void {
    // Trigger re-render with new data
    // Implementation depends on React state management in streaming scenarios
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.screen) {
      this.screen.destroy();
    }
  }
}