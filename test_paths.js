const fs = require('fs');
const srcDir = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\e2c09497-5008-4272-9beb-e6b92c53eb5b';
const destDir = 'c:\\Users\\user\\Documents\\app\\ai_tycoon\\public\\images';

console.log('srcDir exists:', fs.existsSync(srcDir));
console.log('destDir exists:', fs.existsSync(destDir));

if (fs.existsSync(srcDir)) {
  console.log('Files in srcDir:', fs.readdirSync(srcDir));
}
