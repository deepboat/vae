module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true
  },
  extends: [
    'eslint:recommended',
    '@typescript-eslint/recommended'
  ],
  parserOptions: {
    ecmaVersion: 2021,
    sourceType: 'module'
  },
  rules: {
    // Code quality rules
    'no-unused-vars': 'warn',
    'no-console': 'off', // Allow console in development
    'prefer-const': 'error',
    'no-var': 'error',
    
    // Best practices
    'eqeqeq': ['error', 'always'],
    'no-eval': 'error',
    'no-implied-eval': 'error',
    'no-new-func': 'error',
    'no-script-url': 'error',
    
    // Error prevention
    'no-duplicate-imports': 'error',
    'no-self-compare': 'error',
    'no-unmodified-loop-condition': 'error',
    'no-unreachable-loop': 'error',
    'no-unused-expressions': 'warn',
    
    // Style preferences
    'camelcase': ['error', { properties: 'never' }],
    'consistent-return': 'error',
    'curly': ['error', 'all'],
    'default-case': 'error',
    'dot-notation': 'error',
    'no-duplicate-case': 'error',
    'no-empty': 'warn',
    'no-empty-function': 'warn',
    'no-extra-semi': 'error',
    'no-func-assign': 'error',
    'no-irregular-whitespace': 'error',
    'no-obj-calls': 'error',
    'no-sparse-arrays': 'error',
    'no-unexpected-multiline': 'error',
    'no-unneeded-ternary': 'error',
    'no-useless-return': 'error',
    'prefer-template': 'error',
    'spaced-comment': 'warn',
    'yoda': 'error',
    
    // Chrome extension specific
    'no-restricted-globals': ['error', 'chrome'] // Prevent global chrome variable conflicts
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true
      },
      rules: {
        'no-console': 'off'
      }
    }
  ]
};