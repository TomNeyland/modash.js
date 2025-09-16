/**
 * Theme system for TUI components
 * Handles colors, borders, and responsive design
 */

import chalk from 'chalk';

export interface ThemeConfig {
  accent?: string;
  border?: 'none' | 'single' | 'double' | 'round';
  colors?: {
    primary?: string;
    secondary?: string;
    success?: string;
    error?: string;
    warning?: string;
    muted?: string;
  };
}

export interface BorderChars {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  cross: string;
  topTee: string;
  bottomTee: string;
  leftTee: string;
  rightTee: string;
}

const BORDER_STYLES: Record<string, BorderChars> = {
  single: {
    topLeft: '┌',
    topRight: '┐',
    bottomLeft: '└',
    bottomRight: '┘',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    topTee: '┬',
    bottomTee: '┴',
    leftTee: '├',
    rightTee: '┤',
  },
  double: {
    topLeft: '╔',
    topRight: '╗',
    bottomLeft: '╚',
    bottomRight: '╝',
    horizontal: '═',
    vertical: '║',
    cross: '╬',
    topTee: '╦',
    bottomTee: '╩',
    leftTee: '╠',
    rightTee: '╣',
  },
  round: {
    topLeft: '╭',
    topRight: '╮',
    bottomLeft: '╰',
    bottomRight: '╯',
    horizontal: '─',
    vertical: '│',
    cross: '┼',
    topTee: '┬',
    bottomTee: '┴',
    leftTee: '├',
    rightTee: '┤',
  },
};

export class Theme {
  private config: ThemeConfig;
  private supportsColor: boolean;
  private supportsUnicode: boolean;

  constructor(config: ThemeConfig = {}) {
    this.config = config;
    this.supportsColor = this.detectColorSupport();
    this.supportsUnicode = this.detectUnicodeSupport();
  }

  private detectColorSupport(): boolean {
    return process.env.NO_COLOR !== '1' && 
           process.env.TERM !== 'dumb' &&
           process.stdout.isTTY;
  }

  private detectUnicodeSupport(): boolean {
    const term = process.env.TERM || '';
    const lang = process.env.LANG || '';
    
    return !term.includes('ascii') && 
           (lang.includes('UTF-8') || lang.includes('utf8'));
  }

  getBorderChars(): BorderChars {
    const style = this.config.border || 'single';
    
    if (!this.supportsUnicode || style === 'none') {
      return {
        topLeft: '+',
        topRight: '+',
        bottomLeft: '+',
        bottomRight: '+',
        horizontal: '-',
        vertical: '|',
        cross: '+',
        topTee: '+',
        bottomTee: '+',
        leftTee: '+',
        rightTee: '+',
      };
    }

    return BORDER_STYLES[style] || BORDER_STYLES.single;
  }

  colorize(text: string, color: 'primary' | 'secondary' | 'success' | 'error' | 'warning' | 'muted' | 'accent'): string {
    if (!this.supportsColor) return text;

    const colors = this.config.colors || {};
    
    switch (color) {
      case 'primary':
        return chalk.cyan(text);
      case 'secondary':
        return chalk.gray(text);
      case 'success':
        return chalk.green(text);
      case 'error':
        return chalk.red(text);
      case 'warning':
        return chalk.yellow(text);
      case 'muted':
        return chalk.dim(text);
      case 'accent':
        const accentColor = this.config.accent || colors.primary;
        if (accentColor && chalk[accentColor as keyof typeof chalk]) {
          return (chalk[accentColor as keyof typeof chalk] as any)(text);
        }
        return chalk.blue(text);
      default:
        return text;
    }
  }

  getTerminalSize(): { width: number; height: number } {
    return {
      width: process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    };
  }

  isNarrowTerminal(): boolean {
    return this.getTerminalSize().width <= 80;
  }

  getMaxTableWidth(): number {
    const { width } = this.getTerminalSize();
    return Math.max(40, width - 4); // Leave some margin
  }

  shouldUseCompactLayout(): boolean {
    return this.isNarrowTerminal();
  }

  formatNumber(value: number): string {
    if (value >= 1000000) {
      return `${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
      return `${(value / 1000).toFixed(1)}K`;
    }
    return value.toString();
  }

  formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }

    return `${size.toFixed(1)}${units[unitIndex]}`;
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  }

  truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength - 1) + '…';
  }

  padText(text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string {
    if (text.length >= width) return text;
    
    const padding = width - text.length;
    
    switch (align) {
      case 'right':
        return ' '.repeat(padding) + text;
      case 'center':
        const leftPad = Math.floor(padding / 2);
        const rightPad = padding - leftPad;
        return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
      default:
        return text + ' '.repeat(padding);
    }
  }
}

// Default theme instance
export const defaultTheme = new Theme();

// Create theme from UI spec theme config
export function createTheme(config?: ThemeConfig): Theme {
  return new Theme(config);
}