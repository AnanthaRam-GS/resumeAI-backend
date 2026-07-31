import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const packageRoot = dirname(require.resolve('computer-modern/package.json'));

const fontUrl = (filename: string): string =>
  pathToFileURL(join(packageRoot, 'fonts', filename)).href;

export const ACADEMIC_SERIF_FONT_STACK =
  '"CMU Serif", "Latin Modern Roman", "Computer Modern", "Times New Roman", Georgia, serif';

export const ACADEMIC_SERIF_PDF_MARGIN = {
  top: '0',
  right: '0',
  bottom: '0',
  left: '0',
};

export const ACADEMIC_SERIF_FONT_FACE_CSS = `
@font-face {
  font-family: "CMU Serif";
  font-style: normal;
  font-weight: 400 500;
  src: url("${fontUrl('cmu-serif-500-roman.woff2')}") format("woff2");
}
@font-face {
  font-family: "CMU Serif";
  font-style: italic;
  font-weight: 400 500;
  src: url("${fontUrl('cmu-serif-500-italic.woff2')}") format("woff2");
}
@font-face {
  font-family: "CMU Serif";
  font-style: normal;
  font-weight: 700;
  src: url("${fontUrl('cmu-serif-700-roman.woff2')}") format("woff2");
}
@font-face {
  font-family: "CMU Serif";
  font-style: italic;
  font-weight: 700;
  src: url("${fontUrl('cmu-serif-700-italic.woff2')}") format("woff2");
}`;

export const injectAcademicSerifFonts = (html: string): string => {
  if (html.includes('font-family: "CMU Serif"') && html.includes('@font-face')) return html;
  if (html.includes('<style>')) {
    return html.replace('<style>', `<style>\n${ACADEMIC_SERIF_FONT_FACE_CSS}`);
  }
  return html.replace('</head>', `<style>${ACADEMIC_SERIF_FONT_FACE_CSS}</style></head>`);
};

export const ACADEMIC_SERIF_BASE_CSS = `
${ACADEMIC_SERIF_FONT_FACE_CSS}
@page { size: A4; margin: 0; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  width: 210mm;
  min-height: 297mm;
  background: #fff;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}
body {
  padding: 10.5mm;
  font-family: ${ACADEMIC_SERIF_FONT_STACK};
  font-size: 12pt;
  line-height: 1.2;
  color: #111;
  overflow-wrap: break-word;
  hyphens: auto;
  orphans: 2;
  widows: 2;
}
header {
  text-align: center;
  margin-bottom: 18pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
h1 {
  font-family: ${ACADEMIC_SERIF_FONT_STACK};
  font-size: 25pt;
  font-weight: 400;
  line-height: 1.08;
  color: #111;
  margin: 0 0 5pt;
  letter-spacing: 0;
}
.header-sub {
  font-size: 11pt;
  color: #333;
  font-style: italic;
  margin-top: 2pt;
}
.contact-row {
  display: flex;
  justify-content: center;
  flex-wrap: wrap;
  gap: 3pt 6pt;
  margin-top: 6pt;
  font-size: 12pt;
  line-height: 1.2;
}
.contact-item {
  color: #003399;
  overflow-wrap: anywhere;
}
.contact-sep {
  color: #222;
}
section {
  margin-top: 18pt;
  break-inside: auto;
  page-break-inside: auto;
}
h2 {
  font-family: ${ACADEMIC_SERIF_FONT_STACK};
  font-size: 17.5pt;
  font-weight: 500;
  font-variant: small-caps;
  text-transform: uppercase;
  letter-spacing: 0;
  color: #111;
  border-bottom: 1px solid #222;
  padding-bottom: 2pt;
  margin: 0 0 10pt;
  line-height: 1.05;
  break-after: avoid;
  page-break-after: avoid;
}
p {
  font-size: 12pt;
  line-height: 1.2;
  color: #111;
  margin-bottom: 5pt;
  orphans: 2;
  widows: 2;
}
.summary {
  text-align: justify;
}
.entry {
  margin-bottom: 10pt;
  break-inside: auto;
  page-break-inside: auto;
}
.entry-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  gap: 14pt;
  align-items: start;
  break-inside: avoid;
  page-break-inside: avoid;
  break-after: avoid;
  page-break-after: avoid;
}
.entry-title {
  font-weight: 700;
  color: #111;
}
.entry-period,
.entry-tech,
.muted {
  color: #111;
  font-style: italic;
  text-align: right;
}
.entry-org,
.entry-desc {
  color: #111;
  margin-top: 1pt;
  break-after: avoid;
  page-break-after: avoid;
  orphans: 2;
  widows: 2;
}
ul {
  padding-left: 18pt;
  margin: 4pt 0 0;
}
li {
  margin-bottom: 2pt;
  padding-left: 2pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
table {
  width: 100%;
  border-collapse: collapse;
}
.skill-cat {
  width: 145px;
  font-weight: 700;
  vertical-align: top;
  padding: 2pt 8pt 2pt 0;
}
td {
  padding: 2pt 0;
  vertical-align: top;
}
.education-entry {
  display: grid;
  grid-template-columns: minmax(65px, auto) minmax(0, 1fr) max-content;
  gap: 14pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
.cert-entry {
  margin-bottom: 4pt;
  break-inside: avoid;
  page-break-inside: avoid;
}
a {
  color: #003399;
  text-decoration: none;
}`;
