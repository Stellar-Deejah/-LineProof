module.exports = {
  env: { browser: true, es2020: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['@typescript-eslint'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.name='React']",
        message: "Do not use the React namespace implicitly (e.g., React.ReactNode). Import the specific type from 'react' instead."
      },
      {
        selector: "TSQualifiedName[left.name='React']",
        message: "Do not use the React namespace implicitly (e.g., React.ReactNode). Import the specific type from 'react' instead."
      }
    ]
  },
};
