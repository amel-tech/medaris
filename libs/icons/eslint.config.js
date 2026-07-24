import { baseConfig } from '@madrasah/eslint-config/base'

const iconsConfig = [
  ...baseConfig,
  {
    rules: {
      'no-restricted-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    },
  },
]

export default iconsConfig
