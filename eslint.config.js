import hooks from 'eslint-plugin-react-hooks'

// Only the hooks rules: a hook after an early return broke the order confirmation (2026-10-19). Runs in the deploy.
export default [{
  files: ['src/**/*.{js,jsx}'],
  plugins: { 'react-hooks': hooks },
  languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: { 'react-hooks/rules-of-hooks': 'error' },
}]
