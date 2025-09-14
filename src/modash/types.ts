/**
 * Advanced TypeScript utility types and branded types for modash
 */

// Branded types for better type safety
declare const __fieldPathBrand: unique symbol;
declare const __systemVariableBrand: unique symbol;

export type BrandedFieldPath = string & { readonly [__fieldPathBrand]: true };
export type BrandedSystemVariable = string & {
  readonly [__systemVariableBrand]: true;
};

// Type predicates for branded types
export function isFieldPath(value: string): value is BrandedFieldPath {
  return value.startsWith('$') && !value.startsWith('$$');
}

export function isSystemVariable(
  value: string
): value is BrandedSystemVariable {
  return value.startsWith('$$');
}

// Utility types for better type inference
export type Prettify<T> = {
  [K in keyof T]: T[K];
} & {};

export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends (infer U)[]
    ? DeepReadonlyArray<U>
    : T[P] extends object
      ? DeepReadonly<T[P]>
      : T[P];
};

interface DeepReadonlyArray<T> extends ReadonlyArray<DeepReadonly<T>> {}

// Type for extracting keys that have specific value types
export type KeysOfType<T, U> = {
  [K in keyof T]: T[K] extends U ? K : never;
}[keyof T];

// Type for making specific keys optional
export type MakeOptional<T, K extends keyof T> = Omit<T, K> &
  Partial<Pick<T, K>>;

// Type for making specific keys required
export type MakeRequired<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Type for non-empty arrays
export type NonEmptyArray<T> = [T, ...T[]];

// Type guards
export function isNonEmptyArray<T>(arr: T[]): arr is NonEmptyArray<T> {
  return arr.length > 0;
}

// Conditional types for MongoDB-style operations
export type IfEquals<X, Y, A = X, B = never> =
  (<T>() => T extends X ? 1 : 2) extends <T>() => T extends Y ? 1 : 2 ? A : B;

export type WritableKeys<T> = {
  [P in keyof T]-?: IfEquals<
    { [Q in P]: T[P] },
    { -readonly [Q in P]: T[P] },
    P
  >;
}[keyof T];

export type ReadonlyKeys<T> = {
  [P in keyof T]-?: IfEquals<
    { [Q in P]: T[P] },
    { -readonly [Q in P]: T[P] },
    never,
    P
  >;
}[keyof T];

// Pipeline stage type helpers
export type StageOperator<T> = keyof T & string;

// Function type utilities
export type ExtractReturnType<T> = T extends (...args: any[]) => infer R
  ? R
  : never;

export type ExtractParameters<T> = T extends (...args: infer P) => any
  ? P
  : never;
