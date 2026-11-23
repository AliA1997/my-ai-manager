import js from '@eslint/js';
import tseslint from 'typescript-eslint';

// Lints the TypeScript in src/ (DX-4). The older plain-JavaScript files keep their own style (see implement-code skill).
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'data/**',
      'node_modules/**',
      'public/**',
      'test/**',
      'helpers/**',
      'scripts/**',
      'src/**/*.js',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    files: ['src/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error', // DX-3
      '@typescript-eslint/ban-ts-comment': [
        'error',
        { 'ts-ignore': 'allow-with-description', minimumDescriptionLength: 10 },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='useEffect']",
          message: 'FE-10: no useEffect. Use a loader, an action, or derive during render.',
        },
        { selector: "CallExpression[callee.property.name='useEffect']", message: 'FE-10: no useEffect.' },
        {
          selector: 'JSXAttribute[name.name=/^dangerously/]',
          message: 'SEC-4: no untrusted markup.',
        },
      ],
    },
  },
);
