import sharp from "sharp";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(__dirname, "../../artifacts/tandatanganin/public");

// Full app icon SVG — red rounded square + white pen mark
const iconSvg = (size) => {
  const r = Math.round(size * 0.2);
  return Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" fill="#FF3C00"/>
  <!-- pen nib body -->
  <g transform="translate(${size * 0.18}, ${size * 0.18}) scale(${size / 180})">
    <!-- pen body -->
    <rect x="62" y="20" width="56" height="88" rx="12" fill="white" opacity="0.95"/>
    <!-- pen nib -->
    <path d="M74 108 L90 148 L106 108 Z" fill="white" opacity="0.95"/>
    <!-- pen clip line -->
    <rect x="88" y="28" width="4" height="72" rx="2" fill="#FF3C00" opacity="0.5"/>
    <!-- pen tip dot -->
    <circle cx="90" cy="148" r="4" fill="white"/>
  </g>
</svg>`);
};

// Maskable icon — more padding for safe zone
const maskableSvg = (size) => {
  const scale = size / 180;
  return Buffer.from(`<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#FF3C00"/>
  <g transform="translate(${size * 0.22}, ${size * 0.22}) scale(${(size * 0.56) / 180})">
    <rect x="62" y="20" width="56" height="88" rx="12" fill="white" opacity="0.95"/>
    <path d="M74 108 L90 148 L106 108 Z" fill="white" opacity="0.95"/>
    <rect x="88" y="28" width="4" height="72" rx="2" fill="#FF3C00" opacity="0.5"/>
    <circle cx="90" cy="148" r="4" fill="white"/>
  </g>
</svg>`);
};

const sizes = [192, 512];

for (const size of sizes) {
  const outPath = path.join(outDir, `pwa-icon-${size}.png`);
  await sharp(iconSvg(size), { density: 300 })
    .png()
    .toFile(outPath);
  console.log(`✓ ${outPath}`);

  const maskPath = path.join(outDir, `pwa-icon-${size}-maskable.png`);
  await sharp(maskableSvg(size), { density: 300 })
    .png()
    .toFile(maskPath);
  console.log(`✓ ${maskPath}`);
}

// Apple touch icon (180x180, no rounded corners — iOS applies its own mask)
const appleSize = 180;
const appleSvg = Buffer.from(`<svg width="${appleSize}" height="${appleSize}" viewBox="0 0 ${appleSize} ${appleSize}" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="${appleSize}" height="${appleSize}" fill="#FF3C00"/>
  <g transform="translate(${appleSize * 0.18}, ${appleSize * 0.18}) scale(${appleSize / 180})">
    <rect x="62" y="20" width="56" height="88" rx="12" fill="white" opacity="0.95"/>
    <path d="M74 108 L90 148 L106 108 Z" fill="white" opacity="0.95"/>
    <rect x="88" y="28" width="4" height="72" rx="2" fill="#FF3C00" opacity="0.5"/>
    <circle cx="90" cy="148" r="4" fill="white"/>
  </g>
</svg>`);
const appleOut = path.join(outDir, "apple-touch-icon.png");
await sharp(appleSvg, { density: 300 }).png().toFile(appleOut);
console.log(`✓ ${appleOut}`);

console.log("All PWA icons generated.");
