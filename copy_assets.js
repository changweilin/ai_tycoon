const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\user\\.gemini\\antigravity-ide\\brain\\e2c09497-5008-4272-9beb-e6b92c53eb5b';
const destDir = 'c:\\Users\\user\\Documents\\app\\ai_tycoon\\public\\images';

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function copyFile(src, dest) {
  try {
    ensureDir(path.dirname(dest));
    fs.copyFileSync(src, dest);
    console.log(`Copied ${src} -> ${dest}`);
  } catch (err) {
    console.error(`Failed to copy ${src} -> ${dest}:`, err.message);
  }
}

if (!fs.existsSync(srcDir)) {
  console.error(`Source directory does not exist: ${srcDir}`);
  process.exit(1);
}

ensureDir(destDir);

const files = fs.readdirSync(srcDir);

// 1. Copy game_logo_candidates
const logoFiles = files.filter(f => f.startsWith('game_logo_candidates_') && f.endsWith('.png'));
if (logoFiles.length > 0) {
  // Get the most recent one
  logoFiles.sort((a, b) => {
    const statA = fs.statSync(path.join(srcDir, a));
    const statB = fs.statSync(path.join(srcDir, b));
    return statB.mtimeMs - statA.mtimeMs;
  });
  copyFile(path.join(srcDir, logoFiles[0]), path.join(destDir, 'game_logo_candidates.png'));
}

// 2. Copy characters (char_*.png) -> public/images/characters/
const charFiles = files.filter(f => f.startsWith('char_') && f.endsWith('.png'));
for (const f of charFiles) {
  const parts = f.split('_');
  if (parts.length >= 2) {
    const name = parts[1];
    copyFile(path.join(srcDir, f), path.join(destDir, 'characters', `${name}.png`));
  }
}

// 3. Copy chibis (chibi_*.png) -> public/images/avatars/
const chibiFiles = files.filter(f => f.startsWith('chibi_') && f.endsWith('.png'));
for (const f of chibiFiles) {
  const parts = f.split('_');
  if (parts.length >= 2) {
    const name = parts[1];
    copyFile(path.join(srcDir, f), path.join(destDir, 'avatars', `${name}_chibi.png`));
  }
}

// 4. Copy logos (logo_*.png) -> public/images/logos/
const logoBrandFiles = files.filter(f => f.startsWith('logo_') && f.endsWith('.png'));
for (const f of logoBrandFiles) {
  const parts = f.split('_');
  if (parts.length >= 2) {
    const name = parts[1];
    copyFile(path.join(srcDir, f), path.join(destDir, 'logos', `${name}.png`));
  }
}

// 5. Copy flags (flag_*.png) -> public/images/flags/
const flagFiles = files.filter(f => f.startsWith('flag_') && f.endsWith('.png'));
for (const f of flagFiles) {
  const parts = f.split('_');
  if (parts.length >= 2) {
    const name = parts[1];
    copyFile(path.join(srcDir, f), path.join(destDir, 'flags', `flag_${name}.png`));
  }
}

console.log('Finished copying assets.');
