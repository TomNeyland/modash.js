/**
 * Typed error classes for modash operations
 */

export class ModashError extends Error {
  public override readonly name: string = 'ModashError';

  constructor(
    message: string,
    public readonly context?: Record<string, unknown>
  ) {
    super(message);
  }
}

export class AggregationError extends ModashError {
  public override readonly name: string = 'AggregationError';

  constructor(
    message: string,
    public readonly stage?: string,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}

export class ExpressionError extends ModashError {
  public override readonly name: string = 'ExpressionError';

  constructor(
    message: string,
    public readonly expression?: string,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}

export class OperatorError extends ModashError {
  public override readonly name: string = 'OperatorError';

  constructor(
    message: string,
    public readonly operator?: string,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}

export class ValidationError extends ModashError {
  public override readonly name: string = 'ValidationError';

  constructor(
    message: string,
    public readonly field?: string,
    context?: Record<string, unknown>
  ) {
    super(message, context);
  }
}
