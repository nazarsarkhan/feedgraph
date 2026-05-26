const { FlatCompat } = require('@eslint/eslintrc');
const js = require('@eslint/js');

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
});

// eslint-config-google is legacy-format and unmaintained since 2018; FlatCompat
// is the bridge to keep it usable under ESLint v9+ flat config.
const compatConfigs = compat
  .config({
    parser: '@typescript-eslint/parser',
    parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
    env: { node: true, es2022: true },
    plugins: ['@typescript-eslint'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'google',
      'plugin:prettier/recommended',
    ],
    rules: {
      'require-jsdoc': 'off',
      'valid-jsdoc': 'off',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      'no-unused-vars': 'off',
    },
  })
  .map((cfg) => ({ ...cfg, files: ['**/*.{ts,tsx,js,cjs}'] }));

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '**/*.config.js',
      '**/*.config.cjs',
    ],
  },
  ...compatConfigs,
];
