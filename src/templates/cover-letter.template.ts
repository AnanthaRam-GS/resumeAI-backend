const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface CoverLetterRenderData {
  senderName: string;
  senderEmail: string;
  jobTitle: string;
  companyName: string;
  contentText: string;
}

export const coverLetterTemplate = (data: CoverLetterRenderData): string => {
  const paragraphs = data.contentText
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Cover Letter — ${esc(data.senderName)}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
         font-size: 12px; color: #111; line-height: 1.65; background: #fff; }
  .page { max-width: 680px; margin: 0 auto; padding: 48px 40px; }
  .sender { margin-bottom: 28px; }
  .sender h1 { font-size: 16px; font-weight: 700; margin-bottom: 2px; }
  .sender .email { font-size: 11px; color: #555; }
  .meta { margin-bottom: 24px; font-size: 11px; color: #444; }
  .meta p { margin-bottom: 2px; }
  .subject { font-size: 12px; font-weight: 700; margin-bottom: 18px; }
  .body p { margin-bottom: 14px; font-size: 11.5px; }
  .closing { margin-top: 24px; font-size: 11.5px; }
  .closing p { margin-bottom: 4px; }
  .sig { margin-top: 32px; font-weight: 700; font-size: 12px; }
</style>
</head>
<body>
<div class="page">
  <div class="sender">
    <h1>${esc(data.senderName)}</h1>
    <span class="email">${esc(data.senderEmail)}</span>
  </div>
  <div class="meta">
    <p>${esc(data.companyName)}</p>
    <p>Re: ${esc(data.jobTitle)}</p>
  </div>
  <div class="body">
    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join('\n    ')}
  </div>
  <div class="sig">${esc(data.senderName)}</div>
</div>
</body>
</html>`;
};
