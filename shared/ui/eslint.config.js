import { reactConfig } from "@madrasah/eslint-config/react"

const uiConfig = [
  ...reactConfig,
  {
    rules: {
      "max-len": "off",
      "@typescript-eslint/no-use-before-define": "off",
      "@stylistic/quotes": ["error", "double"],
    },
  },
]

export default uiConfig
