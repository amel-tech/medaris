#!/usr/bin/env node

/**
 * Token processing script for @madrasah/tokens
 *
 * This script processes the input/main.css file and transforms semantic tokens
 * to reference namespaced primitive tokens in the Tailwind CSS v4 format.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

/**
 * Transform semantic token names to proper namespaced format
 */
function transformSemanticTokenName(name) {
  // Remove 'color-semantic-' prefix and transform to proper namespace
  if (name.startsWith('color-semantic-')) {
    const withoutPrefix = name.replace('color-semantic-', '');
    
    // Transform based on the token type
    if (withoutPrefix.startsWith('background-')) {
      return withoutPrefix.replace('background-', 'background-color-');
    } else if (withoutPrefix.startsWith('text-')) {
      return withoutPrefix.replace('text-', 'text-color-');
    } else if (withoutPrefix.startsWith('border-')) {
      return withoutPrefix.replace('border-', 'border-color-');
    }
    
    // If it doesn't match expected patterns, return as is
    return withoutPrefix;
  }
  
  return name;
}



console.log('🔄 Processing design tokens...');

// Read the input CSS file
const inputPath = join(packageRoot, 'input/main.css');
const outputPath = join(packageRoot, 'theme/main.css');

try {
  const inputContent = readFileSync(inputPath, 'utf-8');
  
  // Extract tokens from the @theme block
  const themeMatch = inputContent.match(/@theme\s*{([^}]+)}/s);
  if (!themeMatch) {
    console.error('❌ No @theme block found in input file');
    process.exit(1);
  }

  const themeContent = themeMatch[1];
  const tokens = new Map();
  
  // Parse all CSS variables
  const variableRegex = /--([^:]+):\s*([^;]+);/g;
  let match;

  while ((match = variableRegex.exec(themeContent)) !== null) {
    const [, name, value] = match;
    tokens.set(name.trim(), value.trim());
  }

  console.log(`📋 Found ${tokens.size} tokens`);

  // Generate the new @theme block with only semantic references
  let outputTheme = '@theme {\n';

  // Only process semantic tokens - no primitives in output
  const semanticTokens = [];

  for (const [name, value] of tokens) {
    if (name.startsWith('color-semantic-')) {
      semanticTokens.push([name, value]);
    }
  }

  console.log(`📋 Found ${semanticTokens.length} semantic tokens to process`);

  // Group tokens by namespace for organized output
  const tokensByNamespace = {
    'background-color': [],
    'text-color': [],
    'border-color': []
  };

  // Transform and group semantic tokens
  semanticTokens.forEach(([name, value]) => {
    const transformedName = transformSemanticTokenName(name);
    
    // Determine namespace
    let namespace = 'other';
    if (transformedName.startsWith('background-color-')) {
      namespace = 'background-color';
    } else if (transformedName.startsWith('text-color-')) {
      namespace = 'text-color';
    } else if (transformedName.startsWith('border-color-')) {
      namespace = 'border-color';
    }
    
    if (tokensByNamespace[namespace]) {
      tokensByNamespace[namespace].push([transformedName, value]);
    }
  });

  // Generate organized output with comments
  Object.entries(tokensByNamespace).forEach(([namespace, tokens]) => {
    if (tokens.length > 0) {
      outputTheme += `\n  /* ${namespace}s */\n`;
      tokens.forEach(([name, value]) => {
        outputTheme += `  --${name}: ${value};\n`;
      });
    }
  });

  outputTheme += '}\n';

  // Ensure the theme directory exists
  const themeDir = dirname(outputPath);
  mkdirSync(themeDir, { recursive: true });

  // Write the processed theme
  writeFileSync(outputPath, outputTheme, 'utf-8');
  
  console.log('✅ Successfully processed tokens');
  console.log('📝 Output written to: theme/main.css');
  console.log(`🎯 Generated ${semanticTokens.length} semantic tokens with direct values`);
} catch (error) {
  console.error('❌ Error processing tokens:', error.message);
  process.exit(1);
}
