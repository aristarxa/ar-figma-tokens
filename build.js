// Simple build script that copies code.ts to code.js without TypeScript compilation
const fs = require('fs');
const path = require('path');

const srcPath = path.join(__dirname, 'src', 'code.ts');
const distDir = path.join(__dirname, 'dist');
const distPath = path.join(distDir, 'code.js');

// Create dist directory if it doesn't exist
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// Read source file
let code = fs.readFileSync(srcPath, 'utf8');

// Remove TypeScript type annotations (simple regex-based approach)
code = code
  // Remove interface declarations
  .replace(/interface\s+\w+\s*\{[^}]*\}/gs, '')
  // Remove type declarations
  .replace(/type\s+\w+\s*=[^;]+;/g, '')
  // Remove type annotations from parameters and variables
  .replace(/:\s*[A-Z]\w+(<[^>]+>)?(\[\])?/g, '')
  // Remove <type> casts
  .replace(/<[A-Z]\w+>/g, '')
  // Remove 'as Type' casts
  .replace(/\s+as\s+\w+/g, '')
  // Clean up multiple empty lines
  .replace(/\n\s*\n\s*\n/g, '\n\n');

// Write to dist
fs.writeFileSync(distPath, code, 'utf8');

console.log('✅ Build completed: dist/code.js');
