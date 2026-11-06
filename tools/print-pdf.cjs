// usage: node build_pdf.js <input.html> <output.pdf> [--landscape]
// Renders with Chromium (print media, backgrounds on, CSS @page size honoured), then prints page count.
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [inp, out] = process.argv.slice(2);
  if (!inp || !out) { console.error('usage: node build_pdf.js in.html out.pdf [--landscape]'); process.exit(2); }
  const landscape = process.argv.includes('--landscape');
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.goto('file://' + path.resolve(inp));
  await p.evaluate(() => document.documentElement.setAttribute('data-print', '1'));
  await p.emulateMedia({ media: 'print', colorScheme: 'light' });
  await p.waitForTimeout(300);
  await p.pdf({ path: out, printBackground: true, preferCSSPageSize: !landscape, landscape, format: 'Letter', margin: { top: 0, right: 0, bottom: 0, left: 0 } });
  const sheets = await p.evaluate(() => document.querySelectorAll('.sheet').length);
  await b.close();
  console.log(`wrote ${out}  (${sheets} .sheet elements)`);
})();
