// One-off icon generator -- rasterizes the app's existing pin glyph
// (the same circle+pin shape LocationPlacement.tsx draws for a selected
// location, coral-on-navy) into the PWA icon set via sharp, already a
// project dependency. Not part of the app's runtime code; run once to
// produce public/icons/*.png.
const sharp = require("sharp");
const path = require("path");

const NAVY = "#0D1524";
const CORAL = "#CE5D40";

function markSvg(size, scale) {
  const cx = size / 2;
  const r = size * scale * 0.3; // circle radius
  const pinH = r * 1.5; // triangle height, tip to circle's bottom edge
  const pinW = r * 1.15;
  const totalH = r * 2 + pinH;
  const circleCy = size / 2 - totalH / 2 + r;
  const triTop = circleCy + r * 0.92; // slight overlap so there's no seam
  const tipY = circleCy + r + pinH;
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" fill="${NAVY}"/>
      <path d="M${cx} ${triTop} L${cx - pinW / 2} ${tipY} L${cx + pinW / 2} ${tipY} Z" fill="${CORAL}"/>
      <circle cx="${cx}" cy="${circleCy}" r="${r}" fill="${CORAL}"/>
    </svg>`;
}

async function main() {
  const outDir = path.join(process.cwd(), "public", "icons");
  const jobs = [
    { file: "icon-192.png", size: 192, scale: 0.62 },
    { file: "icon-512.png", size: 512, scale: 0.62 },
    { file: "maskable-192.png", size: 192, scale: 0.44 },
    { file: "maskable-512.png", size: 512, scale: 0.44 },
    { file: "apple-touch-180.png", size: 180, scale: 0.62 },
  ];
  for (const job of jobs) {
    const svg = Buffer.from(markSvg(job.size, job.scale));
    await sharp(svg).png().toFile(path.join(outDir, job.file));
    console.log("wrote", job.file);
  }

  const faviconSvg = Buffer.from(markSvg(32, 0.62));
  await sharp(faviconSvg).png().toFile(path.join(process.cwd(), "public", "favicon.png"));
  console.log("wrote favicon.png");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
