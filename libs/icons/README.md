# @madrasah/icons

Custom icon library extending Phosphor Icons with Madrasah-specific icons.

## Features

- 🎨 **All Phosphor Icons** - Complete access to Phosphor's icon library
- 🏢 **Custom Icons** - Madrasah-specific icons with consistent styling
- 🎯 **TypeScript Support** - Full type safety and IntelliSense
- ⚛️ **React Ready** - Optimized for React applications

## Installation

This package is internal to the Madrasah monorepo:

```bash
npm install @madrasah/icons
```

## Usage

### Import All Phosphor Icons

```tsx
import { HeartIcon, StarIcon, HouseIcon } from "@madrasah/icons";

export function MyComponent() {
  return (
    <div>
      <HeartIcon size={24} weight="fill" />
      <StarIcon size={32} color="#gold" />
      <HouseIcon size={20} weight="bold" />
    </div>
  );
}
```

### Importing SSR-Compatible Icons
For server-side rendering (SSR) compatibility, import icons from the `ssr` submodule:

```tsx
import { HeartIcon, StarIcon, HouseIcon } from "@madrasah/icons/ssr";
export function MyComponent() {
  return (
    <div>
      <HeartIcon size={24} weight="fill" />
      <StarIcon size={32} color="#gold" />
      <HouseIcon size={20} weight="bold" />
    </div>
  );
}
```

### Import Custom Icons

```tsx
import { MadrasahLogo } from "@madrasah/icons/custom";
// for SSR-compatible import:
// import { MadrasahLogo } from "@madrasah/icons/custom/ssr";

export function Header() {
  return (
    <div>
      <MadrasahLogo size={40} color="#primary" weight="bold" />
    </div>
  );
}
```

## Available Props

All icons support Phosphor's standard props:

- `size?: string | number` - Icon size (default: 24)
- `color?: string` - Icon color (default: 'currentColor')
- `weight?: 'thin' | 'light' | 'regular' | 'bold' | 'fill'` - Icon weight
- `mirrored?: boolean` - Mirror the icon horizontally
- Plus all standard SVG props

## Custom Icons

Custom icons are located in `src/custom.tsx`. They follow the same API as Phosphor icons:

### Adding New Custom Icons

1. Create your SVG icon in `src/custom.tsx`
2. Use the `IconProps` interface for consistency
3. Support all weight variations when possible
4. Export from the custom file

```tsx
export const MyCustomIcon: React.FC<IconProps> = ({
  size = 24,
  color = "currentColor",
  weight = "regular",
  ...props
}) => {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      {/* Your SVG paths */}
    </svg>
  );
};
```

## Available Icons

### Phosphor Icons

All icons from [@phosphor-icons/react](https://phosphoricons.com/) are available.

## Development

```bash
# Lint the code
npm run lint

# Type check
npm run type-check
```
