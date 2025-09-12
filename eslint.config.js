export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      'semi': ['error', 'always'],
      'quotes': ['error', 'single'],
      'no-unused-vars': 'error',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: {
      globals: {
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        after: 'readonly',
        before: 'readonly'
      }
    }
  }
];