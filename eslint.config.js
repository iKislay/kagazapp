import { base } from '@kagaz/config/eslint';

export default [
  ...base,
  {
    // Scripts and config files are allowed to talk to the operator.
    files: ['**/scripts/**/*.ts', '**/prisma/seed.ts', '**/*.config.{js,ts,mjs}'],
    rules: { 'no-console': 'off' },
  },
];
