# madrasah-frontend

Frontend repository for the Online Madrasah Project. This project is developed using a monorepo structure with Turborepo.

## Technology Stack

- **Next.js 14** - React framework with App Router
- **TailwindCSS** - Utility-first CSS framework
- **Shadcn/ui** - Reusable components built with Radix UI and Tailwind CSS
- **TypeScript** - Type safety
- **Turborepo** - Build system and monorepo management
- **ESLint** - Code linting and formatting
- **Commitlint** - Conventional commit message linting
- **Husky** - Git hooks

## Getting Started

### Prerequisites

- Node.js 18+
- npm 8+

### Installation

1. Install dependencies:

```bash
npm install
```

2. Start the development server:

```bash
npm run dev
```


## Recommended VS Code Extensions

To ensure a consistent and productive development experience, it is highly recommended to install the recommended VS Code extensions for this codebase. Search `@recommended` in the Extensions Marketplace, and install all.

3. Build all packages:

```bash
npm run build
```

### Available Scripts

- `npm run dev` - Starts development servers for all applications
- `npm run build` - Builds all packages and applications
- `npm run lint` - Lints all packages
- `npm run lint:fix` - Lints and fixes all packages automatically
- `npm run check-types` - Type checks all packages
- `npm run clean` - Cleans all build files
- `npm run prepare` - Sets up Husky git hooks

## Project Structure

This project is organized as a monorepo. Each independent frontend application is located in the `apps/` directory, while shared code is in the `shared/` directory.

### Adding Shadcn/ui Components

To add new Shadcn/ui components to the shared UI package:

1. Add the component file to `shared/ui/src/components/` directory
2. Export it from `shared/ui/src/index.ts` file
3. Import from `@madrasah/ui` package in applications

Example:

```tsx
import { Button, Card } from "@madrasah/ui";
```

## Directory Structure

```
.
├── apps/                    # Independent frontend applications
│   ├── keycloak-theme/      # Keycloak theme application
│   └── tedris/              # Main frontend application (Next.js)
│       ├── app/             # App Router structure
│       ├── components/      # Project-specific components
│       ├── lib/             # Local helpers and utilities
│       └── ...
│
├── shared/                  # Shared code between frontend applications
│   ├── ui/                  # Shared UI components (wrappers or common UI)
│   ├── hooks/               # Shared React hooks
│   ├── utils/               # Shared utility functions
│   ├── types/               # Shared TypeScript types
│   ├── icons/               # Shared icon components
│   ├── tokens/              # Design tokens
│   └── ...
│
├── .env                     # Base environment variables (can be overridden per app)
├── turbo.json               # Turborepo configuration
├── package.json             # Root level dependencies and scripts
├── commitlint.config.js     # Commitlint configuration
└── tsconfig.base.json       # Shared TypeScript configuration
```

## Commit Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) specification. All commit messages are validated using commitlint.

### Commit Message Format

```
<type>: <description>

[optional body]

[optional footer(s)]
```

### Allowed Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **perf**: A code change that improves performance
- **test**: Adding missing tests or correcting existing tests
- **build**: Changes that affect the build system or external dependencies
- **ci**: Changes to our CI configuration files and scripts
- **chore**: Other changes that don't modify src or test files
- **revert**: Reverts a previous commit

### Commit Rules

- **Type**: Must be lowercase and one of the allowed types
- **Description**: Must be present and not end with a period
- **Case**: Subject must not be in start-case, pascal-case, or upper-case

### Examples

✅ **Good commits:**
```bash
feat: add user authentication
fix: resolve login redirect issue
docs: update installation instructions
refactor: simplify user service logic
```

❌ **Bad commits:**
```bash
Add new feature        # Missing type
feat: Add New Feature  # Wrong case
fix: fixed the bug.   # Ends with period
FEAT: new feature     # Wrong type case
```

## Development Workflow

1. **Clone the repository**
2. **Install dependencies**: `npm install`
3. **Create a feature branch**: `git checkout -b feat/your-feature-name`
4. **Make your changes**
5. **Follow commit conventions** when committing
6. **Run tests and linting**: `npm run lint` and `npm run check-types`
7. **Push your branch** and create a pull request

## Contributing

1. Follow the conventional commit format
2. Ensure all linting passes before submitting PR
3. Add appropriate tests for new features
4. Update documentation as needed

For more information about the project structure and development guidelines, please refer to the individual package README files.
