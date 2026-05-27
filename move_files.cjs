const fs = require('fs');
const path = require('path');

function moveDir(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (let entry of entries) {
    if (entry.name === '.' || entry.name === '..') continue;
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (fs.existsSync(destPath)) {
      if (fs.statSync(destPath).isDirectory() && fs.statSync(srcPath).isDirectory()) {
         moveDir(srcPath, destPath);
         continue;
      }
      fs.rmSync(destPath, { recursive: true, force: true });
    }
    fs.renameSync(srcPath, destPath);
  }
}

moveDir('./clone_dir', './');
fs.rmSync('./clone_dir', { recursive: true, force: true });
console.log('Moved files to root');
