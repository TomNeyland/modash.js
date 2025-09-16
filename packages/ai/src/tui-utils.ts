/**
 * TUI Utilities - JSONPath evaluation, formatting, and color rules
 */

import chalk from 'chalk';

/**
 * Simple JSONPath evaluation for data binding
 * Supports basic paths like $.rows, $.series.foo, $.meta
 */
export function evaluateJSONPath(data: any, path: string): any {
  if (!path || path === '$') {
    return data;
  }

  // Remove leading $. if present
  const cleanPath = path.replace(/^\$\.?/, '');
  
  if (!cleanPath) {
    return data;
  }

  // Split path and traverse
  const parts = cleanPath.split('.');
  let current = data;

  for (const part of parts) {
    if (current == null) {
      return null;
    }
    
    // Handle array indexing (e.g., [0])
    if (part.includes('[') && part.includes(']')) {
      const [key, indexStr] = part.split('[');
      const index = parseInt(indexStr.replace(']', ''), 10);
      
      if (key) {
        current = current[key];
      }
      
      if (Array.isArray(current) && !isNaN(index)) {
        current = current[index];
      }
    } else {
      current = current[part];
    }
  }

  return current;
}

/**
 * Format values according to format specifications
 */
export function formatValue(value: any, fmt?: any): string {
  if (value == null) {
    return 'null';
  }

  if (fmt?.truncate && typeof value === 'string' && value.length > fmt.truncate) {
    return value.substring(0, fmt.truncate) + '...';
  }

  // Number formatting
  if (typeof value === 'number' && fmt?.number) {
    return formatNumber(value, fmt.number);
  }

  // Date formatting
  if (value instanceof Date && fmt?.datetime) {
    return formatDate(value, fmt.datetime);
  }

  // String date formatting
  if (typeof value === 'string' && fmt?.datetime && isDateString(value)) {
    return formatDate(new Date(value), fmt.datetime);
  }

  return String(value);
}

/**
 * Format numbers according to format string
 */
function formatNumber(num: number, format: string): string {
  if (format.startsWith('pct:')) {
    const decimals = parseInt(format.split(':')[1] || '2', 10);
    return (num * 100).toFixed(decimals) + '%';
  }

  // Handle comma-separated format like "0,0.00"
  if (format.includes(',')) {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: format.includes('.') ? format.split('.')[1].length : 0,
      maximumFractionDigits: format.includes('.') ? format.split('.')[1].length : 0,
    });
  }

  // Simple decimal places
  if (format.includes('.')) {
    const decimals = format.split('.')[1].length;
    return num.toFixed(decimals);
  }

  return String(num);
}

/**
 * Format dates according to format string
 */
function formatDate(date: Date, format: string): string {
  switch (format) {
    case 'fromNow':
      return formatTimeAgo(date);
    case 'iso':
      return date.toISOString();
    case 'local':
      return date.toLocaleString();
    case 'time':
      return date.toLocaleTimeString();
    case 'date':
      return date.toLocaleDateString();
    default:
      return date.toLocaleString();
  }
}

/**
 * Format time ago (e.g., "2 minutes ago")
 */
function formatTimeAgo(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffDay > 0) {
    return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
  }
  if (diffHour > 0) {
    return `${diffHour} hour${diffHour > 1 ? 's' : ''} ago`;
  }
  if (diffMin > 0) {
    return `${diffMin} minute${diffMin > 1 ? 's' : ''} ago`;
  }
  return `${diffSec} second${diffSec > 1 ? 's' : ''} ago`;
}

/**
 * Check if a string represents a date
 */
function isDateString(str: string): boolean {
  return !isNaN(Date.parse(str));
}

/**
 * Apply color rules based on value and conditions
 */
export function applyColorRules(value: any, colorRules?: Array<{ when: string; color: string }>): string {
  if (!colorRules || colorRules.length === 0) {
    return 'white'; // default color
  }

  for (const rule of colorRules) {
    if (evaluateColorCondition(value, rule.when)) {
      return parseColor(rule.color);
    }
  }

  return 'white';
}

/**
 * Evaluate color condition expressions like "value > 0.95"
 */
function evaluateColorCondition(value: any, condition: string): boolean {
  try {
    // Simple expression evaluation
    // Replace 'value' with actual value in the condition
    const expr = condition.replace(/\bvalue\b/g, String(value));
    
    // Basic safety check - only allow simple comparisons
    if (!/^[\d\s\.\+\-\*\/\(\)<>=!&|]+$/.test(expr.replace(/\s/g, ''))) {
      return false;
    }
    
    // Use Function constructor for safe evaluation of simple expressions
    return new Function('return ' + expr)();
  } catch {
    return false;
  }
}

/**
 * Parse color strings to terminal colors
 */
function parseColor(color: string): string {
  // Handle hex colors
  if (color.startsWith('#')) {
    return color; // blessed handles hex colors
  }
  
  // Handle ANSI 256 colors
  if (color.startsWith('ansi256:')) {
    const code = color.split(':')[1];
    return `ansi256:${code}`;
  }
  
  // Handle named colors
  const namedColors: Record<string, string> = {
    red: 'red',
    green: 'green',
    blue: 'blue',
    yellow: 'yellow',
    cyan: 'cyan',
    magenta: 'magenta',
    white: 'white',
    black: 'black',
    gray: 'gray',
    grey: 'gray',
  };
  
  return namedColors[color.toLowerCase()] || color;
}

/**
 * Check terminal capabilities for fallback decisions
 */
export function getTerminalCapabilities(): {
  hasColor: boolean;
  hasUnicode: boolean;
  width: number;
  height: number;
  isSmall: boolean;
} {
  const width = process.stdout.columns || 80;
  const height = process.stdout.rows || 24;
  
  return {
    hasColor: !process.env.NO_COLOR && process.stdout.isTTY,
    hasUnicode: !process.env.NO_UNICODE && process.env.LANG?.includes('UTF'),
    width,
    height,
    isSmall: width < 80 || height < 24,
  };
}

/**
 * Create fallback table representation for unsupported terminals
 */
export async function createFallbackTable(data: any[], columns?: Array<{ key: string; label?: string }>): Promise<string> {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data to display';
  }

  try {
    const { default: Table } = await import('cli-table3');
    
    let headers: string[] = [];
    let rows: string[][] = [];

    if (columns && columns.length > 0) {
      headers = columns.map(col => col.label || col.key);
      rows = data.map(item => 
        columns.map(col => String(item[col.key] || ''))
      );
    } else {
      // Auto-detect columns
      headers = Object.keys(data[0]);
      rows = data.map(item => 
        headers.map(key => String(item[key] || ''))
      );
    }

    const table = new Table({
      head: headers,
      style: { head: ['cyan'] }
    });

    rows.forEach(row => table.push(row));
    
    return table.toString();
  } catch (error) {
    // Fallback to simple text table if cli-table3 is not available
    return createSimpleTextTable(data, columns);
  }
}

/**
 * Create simple text table as fallback
 */
function createSimpleTextTable(data: any[], columns?: Array<{ key: string; label?: string }>): string {
  if (!Array.isArray(data) || data.length === 0) {
    return 'No data to display';
  }

  let headers: string[] = [];
  let rows: string[][] = [];

  if (columns && columns.length > 0) {
    headers = columns.map(col => col.label || col.key);
    rows = data.map(item => 
      columns.map(col => String(item[col.key] || ''))
    );
  } else {
    headers = Object.keys(data[0]);
    rows = data.map(item => 
      headers.map(key => String(item[key] || ''))
    );
  }

  // Calculate column widths
  const colWidths = headers.map((header, i) => {
    const contentWidths = rows.map(row => String(row[i] || '').length);
    return Math.max(header.length, ...contentWidths, 10);
  });

  // Create header row
  let result = '';
  const headerRow = headers.map((header, i) => header.padEnd(colWidths[i])).join(' | ');
  result += headerRow + '\n';
  result += headers.map((_, i) => '-'.repeat(colWidths[i])).join('-|-') + '\n';

  // Create data rows
  rows.forEach(row => {
    const dataRow = row.map((cell, i) => String(cell || '').padEnd(colWidths[i])).join(' | ');
    result += dataRow + '\n';
  });

  return result;
}

/**
 * Validate widget data binding
 */
export function validateDataBinding(data: any, widget: any): { valid: boolean; error?: string } {
  const boundData = evaluateJSONPath(data, widget.bind?.path || '$');
  
  switch (widget.kind) {
    case 'table':
    case 'list':
      if (!Array.isArray(boundData)) {
        return { valid: false, error: `${widget.kind} widget requires array data` };
      }
      break;
      
    case 'chart.bar':
    case 'chart.line':
      if (!Array.isArray(boundData)) {
        return { valid: false, error: `Chart widget requires array data` };
      }
      if (!widget.bind?.x || !widget.bind?.y) {
        return { valid: false, error: 'Chart widget requires x and y field bindings' };
      }
      break;
      
    case 'metric':
      if (Array.isArray(boundData) && boundData.length === 0) {
        return { valid: false, error: 'Metric widget has no data' };
      }
      break;
  }
  
  return { valid: true };
}