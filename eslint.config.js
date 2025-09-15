import eslintPluginPrettier from 'eslint-plugin-prettier';
import eslintConfigPrettier from 'eslint-config-prettier';
import typescriptEslint from '@typescript-eslint/eslint-plugin';
import typescriptParser from '@typescript-eslint/parser';

export default [
  {
    files: ['src/**/*.ts', 'packages/**/src/**/*.ts'],
    ignores: ['packages/**/demo.ts', '**/node_modules/**'],
    languageOptions: {
      parser: typescriptParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        globalThis: 'readonly',
      },
    },
    plugins: {
      prettier: eslintPluginPrettier,
      '@typescript-eslint': typescriptEslint,
    },
    rules: {
      // Prettier integration
      'prettier/prettier': 'error',

      // TypeScript specific rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],

      // Core JavaScript rules (disabled for TS equivalents)
      'no-unused-vars': 'off',
      'no-console': 'off',
      'no-debugger': 'error',
      'no-alert': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',

      // Modern JavaScript
      'prefer-const': 'error',
      'no-var': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'template-curly-spacing': ['error', 'never'],

      // Code quality
      eqeqeq: ['error', 'always'],
      'no-duplicate-imports': 'error',
      'object-shorthand': 'error',

      // Best practices
      curly: ['error', 'all'],
      'dot-notation': 'error',
      'no-multi-spaces': 'error',
      'no-useless-concat': 'error',
      yoda: 'error',
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        before: 'readonly',
        after: 'readonly',
      },
    },
    rules: {
      'no-unused-expressions': 'off', // Allow chai assertions
    },
  },
  {
    files: ['examples/**/*.js'],
    rules: {
      'no-console': 'off', // Allow console.log in examples
    },
  },
  // Apply prettier config to disable conflicting rules
  eslintConfigPrettier,
];
