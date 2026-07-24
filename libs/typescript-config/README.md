# @madrasah/typescript-config

Shared TypeScript configuration presets for the Madrasah monorepo, providing consistent compiler settings across all packages and applications.

## Available Configurations

### 🔧 `base.json`

The foundational TypeScript configuration with strict settings and modern ES features.

**Features:**

- **ES2022** target with modern lib support
- **Strict mode** enabled for maximum type safety
- **NodeNext** module resolution for better compatibility
- **Declaration files** generation for library packages
- **Incremental compilation** disabled for consistent builds

**Best for:** Libraries, utilities, and shared packages

### ⚛️ `react-library.json`

Configuration optimized for React component libraries and shared UI packages.

**Features:**

- Extends `base.json`
- **JSX** support with React transform
- **Synthetic default imports** for better compatibility
- **ESNext modules** for modern bundlers

**Best for:** React component libraries, UI packages

### 🚀 `nextjs.json`

Configuration specifically tailored for Next.js applications.

**Features:**

- Extends `base.json`
- **Next.js plugin** integration
- **Bundler module resolution** for optimal performance
- **JSX preserve** for Next.js compiler
- **No emit** mode (Next.js handles compilation)
- **JavaScript** file support

**Best for:** Next.js applications

## Usage

### In your `tsconfig.json`:

```json
{
  "extends": "@madrasah/typescript-config/base.json",
  "compilerOptions": {
    // Your project-specific overrides
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### For Next.js apps:

```json
{
  "extends": "@madrasah/typescript-config/nextjs.json",
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

### For React libraries:

```json
{
  "extends": "@madrasah/typescript-config/react-library.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.test.*"]
}
```

## Configuration Details

### Base Configuration

- **Target**: ES2022 for modern JavaScript features
- **Module System**: NodeNext for best compatibility
- **Lib**: ES2022 + DOM for web applications
- **Strict Checks**: Full strict mode enabled
- **Declaration**: Generates `.d.ts` files for libraries

### Strict Settings Enabled

- `strict: true` - Enables all strict type checking
- `noUncheckedIndexedAccess: true` - Safer array/object access
- `isolatedModules: true` - Ensures compatibility with bundlers

### Modern Features

- `esModuleInterop: true` - Better CommonJS/ESM compatibility
- `resolveJsonModule: true` - Import JSON files
- `skipLibCheck: true` - Faster compilation

## Project Structure Integration

This configuration works seamlessly with the monorepo structure:

```
apps/
  └── tedris/                 # Uses nextjs.json
      └── tsconfig.json
  └── keycloak-theme/         # Uses base.json
      └── tsconfig.json
shared/
  └── ui/                     # Uses react-library.json
      └── tsconfig.json
  └── utils/                  # Uses base.json
      └── tsconfig.json
```

## Best Practices

1. **Always extend** from one of the provided configurations
2. **Minimize overrides** - only add project-specific settings
3. **Use path mapping** in individual projects, not in shared configs
4. **Include/exclude** should be project-specific

## Contributing

When updating configurations:

1. Test changes across all consuming packages
2. Consider backward compatibility
3. Document breaking changes
4. Update version if needed

## Package Info

- **Version**: 0.0.0
- **License**: PROPRIETARY
- **Access**: Private (monorepo internal)
