// Renders the SVG app icon to the PNG sizes the web app manifest and iOS need.
// Usage: bun tools/icons/render-icons.ts  (uses the Playwright Chromium; set PW_CHROMIUM_PATH
// to override the executable).
import { chromium } from '@playwright/test';

const SOURCE = 'apps/client/public/icons/icon.svg';
const SIZES = [180, 192, 512];

const svg = await Bun.file(SOURCE).text();
const browser = await chromium.launch(
  process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
);
for (const size of SIZES) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<html><body style="margin:0">${svg.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body></html>`,
  );
  await page.screenshot({
    path: `apps/client/public/icons/icon-${size}.png`,
    omitBackground: false,
  });
  await page.close();
}
await browser.close();
console.log(`rendered ${SIZES.join(', ')} px icons`);
