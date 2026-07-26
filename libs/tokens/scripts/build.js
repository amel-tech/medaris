#!/usr/bin/env node

/**
 * Build script for @madrasah/tokens
 *
 * This script ensures all necessary files are generated and validates the package.
 */

import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

console.log('🔨 Building @madrasah/tokens...');

// Check if required files exist
const requiredFiles = ['input/main.css', 'index.js', 'index.d.ts', 'package.json'];

let allFilesExist = true;

for (const file of requiredFiles) {
  const filePath = join(packageRoot, file);
  if (!existsSync(filePath)) {
    console.error(`❌ Missing required file: ${file}`);
    allFilesExist = false;
  } else {
    console.log(`✅ Found: ${file}`);
  }
}

if (!allFilesExist) {
  console.error('❌ Build failed: Missing required files');
  process.exit(1);
}

// Validate input/main.css has content
try {
  const themeContent = readFileSync(join(packageRoot, 'input/main.css'), 'utf-8');
  if (!themeContent.includes('@theme')) {
    console.error('❌ input/main.css does not contain @theme block');
    process.exit(1);
  }
  console.log('✅ input/main.css is valid');
} catch (error) {
  console.error('❌ Failed to read input/main.css:', error.message);
  process.exit(1);
}

// Validate package.json
try {
  const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf-8'));
  if (packageJson.name !== '@madrasah/tokens') {
    console.error('❌ package.json has incorrect name');
    process.exit(1);
  }
  console.log('✅ package.json is valid');
} catch (error) {
  console.error('❌ Failed to read package.json:', error.message);
  process.exit(1);
}

console.log('🎉 Build completed successfully!');
console.log('\nPackage is ready to be used:');
console.log('  npm install @madrasah/tokens');
console.log('  import tokens from "@madrasah/tokens";');
console.log('  @import "@madrasah/tokens/css"; // In your CSS file');
