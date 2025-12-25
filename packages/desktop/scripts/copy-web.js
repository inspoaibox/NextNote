// 复制 web 构建产物到 desktop/dist/renderer
const fs = require('fs');
const path = require('path');

const webDist = path.join(__dirname, '../../web/dist');
const desktopDist = path.join(__dirname, '../dist/renderer');

function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

console.log('Copying web build to desktop...');
copyDir(webDist, desktopDist);
console.log('Done!');
