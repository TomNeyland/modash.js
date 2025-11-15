/**
 * Terminal UI Renderer - Converts LLM-generated UI instructions into beautiful terminal displays
 */

import chalk from 'chalk';
import boxen from 'boxen';
import Table from 'cli-table3';
import figlet from 'figlet';
import type { UIInstructions, Format } from './ui-schemas.js';
import type { Document } from 'aggo';

export interface RendererOptions {
  /** Terminal width for responsive layout */
  width?: number;
  /** Enable color output */
  colors?: boolean;
  /** Animation speed for streaming updates */
  animationSpeed?: number;
}

/**
 * Terminal UI Renderer for aggo-ai query results
 */
export class TerminalUIRenderer {
  private instructions: UIInstructions;
  private options: RendererOptions;

  constructor(instructions: UIInstructions, options: RendererOptions = {}) {
    this.instructions = instructions;
    this.options = {
      width: 120,
      colors: true,
      animationSpeed: 100,
      ...options
    };
  }

  /**
   * Render the complete UI for query results
   */
  async render(data: Document[]): Promise<void> {
    if (!this.options.colors) {
      chalk.level = 0; // Disable colors
    }

    // Clear screen for fresh display
    console.clear();
    
    // Render title section
    await this.renderTitle();
    
    // Render insights if provided
    if (this.instructions.insights?.length) {
      await this.renderInsights();
    }
    
    // Render main content based on layout
    switch (this.instructions.layout) {
      case 'table':
        await this.renderTable(data);
        break;
      case 'cards':
        await this.renderCards(data);
        break;
      case 'list':
        await this.renderList(data);
        break;
      case 'grid':
        await this.renderGrid(data);
        break;
      case 'chart':
        await this.renderChart(data);
        break;
      default:
        await this.renderTable(data);
    }

    // Render summary section
    if (this.instructions.summary?.show) {
      await this.renderSummary(data);
    }

    // Render footer
    if (this.instructions.footer) {
      await this.renderFooter();
    }
  }

  /**
   * Render streaming updates (for real-time data)
   */
  async renderStreaming(data: Document[], isUpdate: boolean = false): Promise<void> {
    if (isUpdate) {
      // For updates, just re-render the data section
      process.stdout.write('\x1b[2K\r'); // Clear current line
      process.stdout.write('\x1b[10A'); // Move cursor up
      
      switch (this.instructions.layout) {
        case 'table':
          await this.renderTable(data);
          break;
        case 'cards':
          await this.renderCards(data);
          break;
        case 'list':
          await this.renderList(data);
          break;
        case 'grid':
          await this.renderGrid(data);
          break;
        case 'chart':
          await this.renderChart(data);
          break;
      }

      if (this.instructions.summary?.show) {
        await this.renderSummary(data);
      }
    } else {
      await this.render(data);
    }
  }

  /**
   * Render title with ASCII art
   */
  private async renderTitle(): Promise<void> {
    if (!this.instructions.title) return;

    try {
      // Try to create ASCII art for the first word
      const firstWord = this.instructions.title.split(' ')[0];
      const asciiTitle = figlet.textSync(firstWord, { 
        font: 'Small',
        horizontalLayout: 'fitted'
      });
      
      const headerColor = this.instructions.styling?.colors?.header || 'cyan';
      console.log(chalk[headerColor].bold(asciiTitle));
    } catch {
      // Fallback to regular title
      const headerColor = this.instructions.styling?.colors?.header || 'cyan';
      console.log(chalk[headerColor].bold(`\n🚀 ${this.instructions.title}`));
    }

    console.log(chalk.gray(this.instructions.title));
    
    if (this.instructions.subtitle) {
      console.log(chalk.gray(`📊 ${this.instructions.subtitle}`));
    }
    
    console.log();
  }

  /**
   * Render insights section
   */
  private async renderInsights(): Promise<void> {
    if (!this.instructions.insights?.length) return;

    console.log(chalk.yellow('💡 Key Insights:'));
    this.instructions.insights.forEach(insight => {
      console.log(chalk.gray(`  • ${insight}`));
    });
    console.log();
  }

  /**
   * Render data as a table
   */
  private async renderTable(data: Document[]): Promise<void> {
    if (!this.instructions.columns?.length) return;

    const borderColor = this.instructions.styling?.colors?.border || 'cyan';
    const headerColor = this.instructions.styling?.colors?.header || 'cyan';
    
    const table = new Table({
      head: this.instructions.columns.map(col => 
        chalk[headerColor](col.label)
      ),
      style: { 
        head: [], 
        border: [borderColor],
        compact: this.instructions.styling?.compact || false
      },
      colWidths: this.instructions.columns.map(col => col.width || 15),
      colAligns: this.instructions.columns.map(col => col.align || 'left')
    });

    data.forEach(row => {
      const tableRow = this.instructions.columns!.map(col => {
        const value = this.formatValue(row[col.field], col.format);
        const color = col.highlight ? 
          this.instructions.styling?.colors?.highlight || 'yellow' : 
          this.instructions.styling?.colors?.values || 'white';
        return chalk[color](value);
      });
      table.push(tableRow);
    });

    console.log(table.toString());
  }

  /**
   * Render data as cards
   */
  private async renderCards(data: Document[]): Promise<void> {
    if (!this.instructions.columns?.length) return;

    const borderColor = this.instructions.styling?.colors?.border || 'cyan';

    data.forEach(item => {
      const content = this.instructions.columns!
        .map(col => {
          const value = this.formatValue(item[col.field], col.format);
          const labelColor = this.instructions.styling?.colors?.header || 'cyan';
          const valueColor = col.highlight ? 
            this.instructions.styling?.colors?.highlight || 'yellow' : 
            this.instructions.styling?.colors?.values || 'white';
          return `${chalk[labelColor](col.label)}: ${chalk[valueColor](value)}`;
        })
        .join('\n');
      
      console.log(boxen(content, {
        padding: this.instructions.styling?.padding ? 1 : 0,
        margin: 1,
        borderStyle: this.instructions.styling?.theme === 'minimal' ? 'single' : 'round',
        borderColor: borderColor
      }));
    });
  }

  /**
   * Render data as a list
   */
  private async renderList(data: Document[]): Promise<void> {
    if (!this.instructions.columns?.length) return;

    const headerColor = this.instructions.styling?.colors?.header || 'cyan';
    const valueColor = this.instructions.styling?.colors?.values || 'white';

    data.forEach((item, index) => {
      const primaryField = this.instructions.columns![0];
      const primaryValue = this.formatValue(item[primaryField.field], primaryField.format);
      
      console.log(chalk[headerColor](`${index + 1}. ${primaryValue}`));
      
      this.instructions.columns!.slice(1).forEach(col => {
        const value = this.formatValue(item[col.field], col.format);
        const color = col.highlight ? 
          this.instructions.styling?.colors?.highlight || 'yellow' : 
          valueColor;
        console.log(chalk.gray(`   ${col.label}: ${chalk[color](value)}`));
      });
      console.log();
    });
  }

  /**
   * Render data as a grid
   */
  private async renderGrid(data: Document[]): Promise<void> {
    // Grid layout is a compact version of cards arranged in rows
    if (!this.instructions.columns?.length) return;

    const itemsPerRow = Math.floor((this.options.width || 120) / 40); // ~40 chars per item
    
    for (let i = 0; i < data.length; i += itemsPerRow) {
      const row = data.slice(i, i + itemsPerRow);
      const gridRow = row.map(item => {
        const content = this.instructions.columns!
          .slice(0, 3) // Limit to 3 fields for compact display
          .map(col => {
            const value = this.formatValue(item[col.field], col.format);
            const color = col.highlight ? 
              this.instructions.styling?.colors?.highlight || 'yellow' : 
              this.instructions.styling?.colors?.values || 'white';
            return `${chalk.gray(col.label)}: ${chalk[color](value)}`;
          })
          .join('\n');
        
        return boxen(content, {
          padding: 0,
          margin: { right: 1 },
          borderStyle: 'single',
          borderColor: this.instructions.styling?.colors?.border || 'cyan',
          width: 35
        });
      });
      
      console.log(gridRow.join(''));
    }
  }

  /**
   * Render data as a chart
   */
  private async renderChart(data: Document[]): Promise<void> {
    if (!this.instructions.chart) return;

    const { chart } = this.instructions;
    console.log(chalk.cyan.bold(`📈 ${chart.title || 'Data Visualization'}`));
    console.log('─'.repeat(chart.width || 80));

    if (chart.type === 'bar') {
      const maxValue = Math.max(...data.map(item => Number(item[chart.yField]) || 0));
      const barWidth = (chart.width || 80) - 20; // Reserve space for labels
      
      data.forEach(item => {
        const label = String(item[chart.xField]).substring(0, 15).padEnd(15);
        const value = Number(item[chart.yField]) || 0;
        const barLength = Math.round((value / maxValue) * barWidth);
        const bar = '█'.repeat(barLength);
        const valueStr = chart.showValues ? ` ${this.formatValue(value, 'number')}` : '';
        
        console.log(chalk.gray(label) + ' ' + chalk.cyan(bar) + chalk.white(valueStr));
      });
    }

    console.log('─'.repeat(chart.width || 80));
  }

  /**
   * Render summary section
   */
  private async renderSummary(data: Document[]): Promise<void> {
    if (!this.instructions.summary || !this.instructions.columns) return;

    const summaryColor = this.instructions.styling?.colors?.summary || 'green';
    const separator = '═'.repeat(60);
    
    console.log('\n' + chalk[summaryColor](separator));
    console.log(chalk[summaryColor].bold(this.instructions.summary.title || 'SUMMARY'));
    console.log(chalk[summaryColor](separator));
    
    this.instructions.summary.fields.forEach((field, index) => {
      const operation = this.instructions.summary!.operations[index];
      const column = this.instructions.columns!.find(col => col.field === field);
      
      if (!column) return;

      let result: number;
      const values = data.map(item => Number(item[field]) || 0);
      
      switch (operation) {
        case 'sum':
          result = values.reduce((sum, val) => sum + val, 0);
          break;
        case 'avg':
          result = values.reduce((sum, val) => sum + val, 0) / values.length;
          break;
        case 'count':
          result = data.length;
          break;
        case 'min':
          result = Math.min(...values);
          break;
        case 'max':
          result = Math.max(...values);
          break;
        default:
          result = 0;
      }
      
      const formattedResult = this.formatValue(result, column.format);
      const operationLabel = operation.charAt(0).toUpperCase() + operation.slice(1);
      
      console.log(chalk.cyan(`${operationLabel} ${column.label}: `) + 
                  chalk.white.bold(formattedResult));
    });
  }

  /**
   * Render footer section
   */
  private async renderFooter(): Promise<void> {
    if (!this.instructions.footer) return;
    
    console.log('\n' + chalk.gray('─'.repeat(60)));
    console.log(chalk.gray(`ℹ️  ${this.instructions.footer}`));
  }

  /**
   * Format values according to the specified format
   */
  private formatValue(value: unknown, format: Format = 'text'): string {
    if (value == null) return 'N/A';

    switch (format) {
      case 'currency':
        const num = Number(value);
        return isNaN(num) ? String(value) : '$' + num.toLocaleString('en-US', { 
          minimumFractionDigits: 0,
          maximumFractionDigits: 0 
        });
      
      case 'number':
        const numVal = Number(value);
        return isNaN(numVal) ? String(value) : numVal.toLocaleString('en-US');
      
      case 'percentage':
        const pctVal = Number(value);
        return isNaN(pctVal) ? String(value) : (pctVal * 100).toFixed(1) + '%';
      
      case 'date':
        try {
          return new Date(value as string).toLocaleDateString('en-US');
        } catch {
          return String(value);
        }
      
      case 'text':
      default:
        return String(value);
    }
  }
}