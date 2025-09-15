/**
 * CLI Spinner utility with rotating status phrases
 * Provides enhanced UX for the AI CLI with dynamic status messages
 */

export interface SpinnerOptions {
  /** Spinner character to use */
  spinner?: string[];
  /** Interval in milliseconds for spinner rotation */
  interval?: number;
  /** Color support (basic ANSI colors) */
  color?: 'green' | 'blue' | 'yellow' | 'cyan' | 'magenta' | 'red';
  /** Stream to write to (default: process.stderr) */
  stream?: NodeJS.WriteStream;
}

export interface SpinnerPhaseConfig {
  /** Array of phrases to rotate through */
  phrases: string[];
  /** Optional color for this phase */
  color?: SpinnerOptions['color'];
}

/**
 * Default spinner characters (Unicode spinner)
 */
const DEFAULT_SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/**
 * ANSI color codes
 */
const COLORS = {
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  red: '\x1b[31m',
  reset: '\x1b[0m',
  dim: '\x1b[2m',
} as const;

/**
 * Pre-defined phase configurations for different stages
 */
export const SPINNER_PHASES = {
  SCHEMA_INFERENCE: {
    phrases: [
      'Sampling the data',
      'Analyzing document structure',
      'Inferring field types',
      'Building data schema',
      'Examining data patterns',
      'Mapping field relationships',
      'Processing data samples',
      'Detecting data types',
      'Cataloging field structure',
    ],
    color: 'cyan' as const,
  },
  OPENAI_GENERATION: {
    phrases: [
      'Contacting OpenAI',
      'Generating pipeline',
      'Processing natural language',
      'Converting query to MongoDB',
      'Optimizing pipeline structure',
      'Analyzing query intent',
      'Building aggregation steps',
      'Refining pipeline logic',
      'Finalizing query translation',
    ],
    color: 'green' as const,
  },
  EXECUTION: {
    phrases: [
      'Executing pipeline',
      'Processing documents',
      'Running aggregation',
      'Computing results',
      'Applying transformations',
      'Filtering data',
      'Calculating aggregates',
      'Finalizing results',
    ],
    color: 'blue' as const,
  },
} as const;

export class Spinner {
  private spinnerChars: string[];
  private interval: number;
  private color: SpinnerOptions['color'];
  private stream: NodeJS.WriteStream;
  private currentIndex = 0;
  private phraseIndex = 0;
  private timer?: NodeJS.Timeout;
  private currentPhrase = '';
  private phrases: string[] = [];
  private isActive = false;

  constructor(options: SpinnerOptions = {}) {
    this.spinnerChars = options.spinner || DEFAULT_SPINNER;
    this.interval = options.interval || 100;
    this.color = options.color;
    this.stream = options.stream || process.stderr;
  }

  /**
   * Start the spinner with a specific phase configuration
   */
  start(phase: SpinnerPhaseConfig): void;
  start(message: string, color?: SpinnerOptions['color']): void;
  start(
    phaseOrMessage: SpinnerPhaseConfig | string,
    color?: SpinnerOptions['color']
  ): void {
    if (this.isActive) {
      this.stop();
    }

    if (typeof phaseOrMessage === 'string') {
      this.phrases = [phaseOrMessage];
      this.color = color;
    } else {
      this.phrases = phaseOrMessage.phrases;
      this.color = phaseOrMessage.color || color;
    }

    this.currentIndex = 0;
    this.phraseIndex = Math.floor(Math.random() * this.phrases.length);
    this.currentPhrase = this.phrases[this.phraseIndex];
    this.isActive = true;

    // Hide cursor
    if (this.stream.isTTY) {
      this.stream.write('\x1b[?25l');
    }

    this.render();
    this.timer = setInterval(() => {
      this.tick();
    }, this.interval);
  }

  /**
   * Update the spinner with a new message while keeping it running
   */
  updateMessage(message: string): void {
    if (this.isActive) {
      this.currentPhrase = message;
      this.render();
    }
  }

  /**
   * Rotate to next phrase in the current phase (if multiple phrases available)
   */
  nextPhrase(): void {
    if (this.phrases.length > 1) {
      this.phraseIndex = (this.phraseIndex + 1) % this.phrases.length;
      this.currentPhrase = this.phrases[this.phraseIndex];
    }
  }

  /**
   * Stop the spinner and optionally show a completion message
   */
  stop(finalMessage?: string, finalColor?: SpinnerOptions['color']): void {
    if (!this.isActive) return;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }

    // Clear current line
    if (this.stream.isTTY) {
      this.stream.write('\r\x1b[K');

      // Show final message if provided
      if (finalMessage) {
        const colorCode = finalColor ? COLORS[finalColor] : '';
        const resetCode = colorCode ? COLORS.reset : '';
        this.stream.write(`${colorCode}${finalMessage}${resetCode}\n`);
      }

      // Show cursor again
      this.stream.write('\x1b[?25h');
    }

    this.isActive = false;
  }

  /**
   * Check if spinner is currently active
   */
  isSpinning(): boolean {
    return this.isActive;
  }

  private tick(): void {
    this.currentIndex = (this.currentIndex + 1) % this.spinnerChars.length;

    // Occasionally rotate phrase for variety (every ~2 seconds)
    if (this.currentIndex === 0 && Math.random() < 0.1) {
      this.nextPhrase();
    }

    this.render();
  }

  private render(): void {
    if (!this.stream.isTTY || !this.isActive) return;

    const spinner = this.spinnerChars[this.currentIndex];
    const colorCode = this.color ? COLORS[this.color] : '';

    const line = `${colorCode}${spinner}${COLORS.reset} ${COLORS.dim}${this.currentPhrase}...${COLORS.reset}`;

    // Move to beginning of line and clear it, then write new content
    this.stream.write(`\r\x1b[K${line}`);
  }
}

/**
 * Create a spinner for a specific phase
 */
export function createPhaseSpinner(
  phase: keyof typeof SPINNER_PHASES,
  options: SpinnerOptions = {}
): Spinner {
  const phaseConfig = SPINNER_PHASES[phase];
  return new Spinner({
    ...options,
    color: options.color || phaseConfig.color,
  });
}

/**
 * Utility to wrap an async operation with a spinner
 */
export async function withSpinner<T>(
  operation: () => Promise<T>,
  phase: SpinnerPhaseConfig | string,
  options: {
    successMessage?: string;
    errorMessage?: string;
    spinner?: SpinnerOptions;
  } = {}
): Promise<T> {
  const spinner = new Spinner(options.spinner);

  try {
    spinner.start(phase);
    const result = await operation();
    spinner.stop(options.successMessage || '✅ Completed', 'green');
    return result;
  } catch (error) {
    spinner.stop(
      options.errorMessage ||
        `❌ Failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'red'
    );
    throw error;
  }
}
