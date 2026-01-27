const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    // .git 폴더나 숨김 파일은 복사하지 않음
    if (entry.name.startsWith('.') || entry.name === 'node_modules') {
      continue;
    }
    
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const sharedSrc = path.join(__dirname, '../shared');
const sharedDest = path.join(__dirname, 'src/shared');

if (fs.existsSync(sharedSrc)) {
  if (fs.existsSync(sharedDest)) {
    fs.rmSync(sharedDest, { recursive: true, force: true });
  }
  copyDir(sharedSrc, sharedDest);
  console.log('✓ Shared folder copied to src/shared');
} else {
  console.error('✗ Shared folder not found at:', sharedSrc);
  process.exit(1);
}
