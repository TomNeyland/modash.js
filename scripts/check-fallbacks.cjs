const fs = require('fs');
const path = require('path');

const srcDir = 'src';

function checkFile(file) {
  const content = fs.readFileSync(file, 'utf8');
  const fallbackPatterns = [
    /\/\/\s*fallback.*for now/i,
    /\/\/\s*TODO.*fallback/i,
    /\/\/\s*FIXME.*fallback/i,
    /\/\/\s*placeholder.*implementation/i,
    /return\s+collection.*\/\/\s*placeholder/i,
    /return.*unchanged.*\/\/\s*fallback/i,
    /\/\/\s*simplified for now/i
  ];
  
  const lines = content.split('\n');
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    for (const pattern of fallbackPatterns) {
      if (pattern.test(line)) {
        console.error(`❌ Fallback/placeholder found in ${file} line ${i + 1}: ${line}`);
        process.exit(1);
      }
    }
  }
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath);
    } else if (file.endsWith('.ts')) {
      checkFile(filePath);
    }
  });
}

walkDir(srcDir);
console.log('✅ No problematic fallbacks/placeholders found');