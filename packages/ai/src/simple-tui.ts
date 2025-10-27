/**
 * Simple TUI Implementation - Fallback when React-blessed is not available
 * Uses blessed directly for better compatibility
 */

import { AggUIType, Widget } from './schemas.js';
import { evaluateJSONPath, formatValue, getTerminalCapabilities, createFallbackTable } from './tui-utils.js';

/**
 * Simple TUI Manager using blessed directly
 */
export class SimpleTUIManager {
  private screen: any;
  private blessed: any;

  constructor() {
    // Initialize asynchronously
  }

  /**
   * Initialize blessed library
   */
  private async initializeBlessed() {
    if (!this.blessed) {
      try {
        this.blessed = (await import('neo-blessed')).default;
      } catch {
        // Fallback to table if blessed is not available
        return null;
      }
    }
    
    if (!this.screen) {
      this.screen = this.blessed.screen({
        smartCSR: true,
        title: 'aggo-ai - Terminal UI',
        dockBorders: true,
        fullUnicode: true,
      });

      // Handle quit keys
      this.screen.key(['q', 'C-c', 'escape'], () => {
        this.cleanup();
        process.exit(0);
      });
    }
    
    return this.blessed;
  }

  /**
   * Render TUI with given result and spec
   */
  async renderTUI(result: any, spec: AggUIType, streaming = false): Promise<void> {
    const blessed = await this.initializeBlessed();
    
    if (!blessed) {
      this.fallbackToTable(result, spec);
      return;
    }

    try {
      // Clear screen
      this.screen.destroy();
      this.screen = blessed.screen({
        smartCSR: true,
        title: 'aggo-ai - Terminal UI',
        dockBorders: true,
        fullUnicode: true,
      });

      // Handle quit keys
      this.screen.key(['q', 'C-c', 'escape'], () => {
        this.cleanup();
        process.exit(0);
      });

      // Create layout based on spec
      this.createLayout(result, spec);
      
      // Show instructions
      this.showInstructions();
      
      // Render the screen
      this.screen.render();
      
      console.error('🖥️  Terminal UI active. Press "q" to quit.');

    } catch (error) {
      console.error('TUI rendering error:', error);
      await this.fallbackToTable(result, spec);
    }
  }

  /**
   * Create layout based on presentation spec
   */
  private createLayout(result: any, spec: AggUIType) {
    const children = spec.layout.children;
    
    if (children.length === 1) {
      // Single widget - full screen
      this.createWidget(children[0], result, {
        top: 0,
        left: 0,
        width: '100%',
        height: '100%-1', // Leave space for instructions
      });
    } else if (spec.layout.direction === 'row') {
      // Horizontal layout
      const widthPerChild = Math.floor(100 / children.length);
      children.forEach((child, index) => {
        this.createWidget(child, result, {
          top: 0,
          left: `${index * widthPerChild}%`,
          width: `${widthPerChild}%`,
          height: '100%-1',
        });
      });
    } else {
      // Vertical layout
      const heightPerChild = Math.floor((100 - 5) / children.length); // Leave space for instructions
      children.forEach((child, index) => {
        this.createWidget(child, result, {
          top: `${index * heightPerChild}%`,
          left: 0,
          width: '100%',
          height: `${heightPerChild}%`,
        });
      });
    }
  }

  /**
   * Create individual widget
   */
  private createWidget(widget: Widget, result: any, position: any) {
    const boundData = widget.bind ? evaluateJSONPath(result, widget.bind.path) : result;
    
    switch (widget.kind) {
      case 'table':
        this.createTableWidget(widget, boundData, position);
        break;
        
      case 'metric':
        this.createMetricWidget(widget, boundData, position);
        break;
        
      case 'kv':
        this.createKeyValueWidget(widget, boundData, position);
        break;
        
      case 'json':
        this.createJSONWidget(widget, boundData, position);
        break;
        
      default:
        this.createTextWidget(widget, `Unsupported widget: ${widget.kind}`, position);
    }
  }

  /**
   * Create table widget
   */
  private createTableWidget(widget: Widget, data: any[], position: any) {
    if (!Array.isArray(data) || data.length === 0) {
      this.createTextWidget(widget, 'No data available', position);
      return;
    }

    // Create table content
    const columns = widget.bind?.columns || [];
    let content = '';
    
    if (columns.length > 0) {
      // Use specified columns
      const headers = columns.map((col: any) => col.label || col.key);
      content += headers.join('  ').padEnd(80) + '\n';
      content += '─'.repeat(80) + '\n';
      
      data.slice(0, 20).forEach(row => { // Limit rows for display
        const values = columns.map((col: any) => {
          const value = formatValue(row[col.key], widget.fmt);
          return String(value).padEnd(15).substring(0, 15);
        });
        content += values.join('  ') + '\n';
      });
    } else {
      // Auto-detect columns
      const headers = Object.keys(data[0]);
      content += headers.join('  ').padEnd(80) + '\n';
      content += '─'.repeat(80) + '\n';
      
      data.slice(0, 20).forEach(row => {
        const values = headers.map(key => {
          const value = formatValue(row[key], widget.fmt);
          return String(value).padEnd(15).substring(0, 15);
        });
        content += values.join('  ') + '\n';
      });
    }

    const box = this.blessed.box({
      ...position,
      label: widget.title || 'Table',
      content,
      border: { type: 'line' },
      scrollable: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white' },
      },
    });

    this.screen.append(box);
  }

  /**
   * Create metric widget
   */
  private createMetricWidget(widget: Widget, data: any, position: any) {
    const value = Array.isArray(data) ? data[0] : data;
    const displayValue = formatValue(value, widget.fmt);
    
    const box = this.blessed.box({
      ...position,
      label: widget.title || 'Metric',
      content: `{center}${displayValue}{/center}`,
      border: { type: 'line' },
      tags: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white' },
      },
    });

    this.screen.append(box);
  }

  /**
   * Create key-value widget
   */
  private createKeyValueWidget(widget: Widget, data: any, position: any) {
    if (!data || typeof data !== 'object') {
      this.createTextWidget(widget, 'Invalid data for key-value widget', position);
      return;
    }

    const content = Object.entries(data)
      .map(([key, value]) => `${key}: ${formatValue(value, widget.fmt)}`)
      .join('\n');

    const box = this.blessed.box({
      ...position,
      label: widget.title || 'Key-Value',
      content,
      border: { type: 'line' },
      scrollable: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white' },
      },
    });

    this.screen.append(box);
  }

  /**
   * Create JSON widget
   */
  private createJSONWidget(widget: Widget, data: any, position: any) {
    const content = JSON.stringify(data, null, 2);
    
    const box = this.blessed.box({
      ...position,
      label: widget.title || 'JSON',
      content,
      border: { type: 'line' },
      scrollable: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white' },
      },
    });

    this.screen.append(box);
  }

  /**
   * Create simple text widget
   */
  private createTextWidget(widget: Widget, text: string, position: any) {
    const box = this.blessed.box({
      ...position,
      label: widget.title || 'Text',
      content: text,
      border: { type: 'line' },
      scrollable: true,
      style: {
        border: { fg: 'cyan' },
        label: { fg: 'white' },
      },
    });

    this.screen.append(box);
  }

  /**
   * Show instructions at bottom
   */
  private showInstructions() {
    const instructions = this.blessed.box({
      bottom: 0,
      left: 0,
      width: '100%',
      height: 1,
      content: ' Press "q" to quit, "C-c" to force exit',
      style: { fg: 'white', bg: 'blue' },
    });

    this.screen.append(instructions);
  }

  /**
   * Fallback to simple table output
   */
  private async fallbackToTable(result: any, spec: AggUIType) {
    console.log('\n🖥️  Terminal UI not supported, falling back to table view:\n');
    
    if (Array.isArray(result)) {
      const tableOutput = await createFallbackTable(result);
      console.log(tableOutput);
    } else {
      console.log(JSON.stringify(result, null, 2));
    }

    console.log('\n💡 For best experience, use a terminal with full Unicode and color support');
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