import type { ResumeRenderData } from '../types/resume.types.js';

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const minimalTemplate = (data: ResumeRenderData): string => {
  const { user, content } = data;

  const experienceHtml = content.experience.length
    ? `
      <section>
        <h2>Experience</h2>
        ${content.experience
          .map(
            (exp) => `
          <div class="entry">
            <div class="entry-header">
              <strong>${esc(exp.role)}</strong>, ${esc(exp.company)}${exp.location ? `, ${esc(exp.location)}` : ''}
              <span>${esc(exp.startDate)} – ${exp.isCurrent ? 'Present' : esc(exp.endDate ?? '')}</span>
            </div>
            <ul>${exp.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          </div>`,
          )
          .join('')}
      </section>`
    : '';

  const projectsHtml = content.projects.length
    ? `
      <section>
        <h2>Projects</h2>
        ${content.projects
          .map(
            (proj) => `
          <div class="entry">
            <div class="entry-header">
              <strong>${esc(proj.name)}</strong>${proj.tech.length ? ` — ${proj.tech.map(esc).join(', ')}` : ''}
              ${proj.url ? `<a href="${esc(proj.url)}">${esc(proj.url)}</a>` : ''}
            </div>
            <ul>${proj.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>
          </div>`,
          )
          .join('')}
      </section>`
    : '';

  const educationHtml = content.education.length
    ? `
      <section>
        <h2>Education</h2>
        ${content.education
          .map(
            (edu) => `
          <div class="entry">
            <div class="entry-header">
              <strong>${esc(edu.institution)}</strong> — ${esc(edu.degree)}${edu.fieldOfStudy ? `, ${esc(edu.fieldOfStudy)}` : ''}
              <span>${esc(edu.startDate ?? '')}${edu.endDate ? ` – ${esc(edu.endDate)}` : ''}</span>
            </div>
            ${edu.gpa ? `<p class="meta">GPA ${esc(edu.gpa)}${edu.achievements ? `  ·  ${esc(edu.achievements)}` : ''}</p>` : ''}
          </div>`,
          )
          .join('')}
      </section>`
    : '';

  const skillsEntries = Object.entries(content.skills).filter(([, vals]) => vals.length > 0);
  const skillsHtml = skillsEntries.length
    ? `
      <section>
        <h2>Skills</h2>
        <p class="skills-line">
          ${skillsEntries
            .map(([cat, vals]) => `<span><strong>${esc(cat)}:</strong> ${vals.map(esc).join(', ')}</span>`)
            .join('&ensp;|&ensp;')}
        </p>
      </section>`
    : '';

  const certsHtml =
    content.certifications && content.certifications.length
      ? `
      <section>
        <h2>Certifications</h2>
        ${content.certifications
          .map(
            (cert) => `
          <div class="entry">
            <div class="entry-header">
              <span><strong>${esc(cert.name)}</strong> · ${esc(cert.issuer)}</span>
              <span>${esc(cert.date ?? '')}</span>
            </div>
          </div>`,
          )
          .join('')}
      </section>`
      : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(user.fullName)} — Resume</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
         font-size: 11px; color: #111; line-height: 1.5; background: #fff; }
  .page { max-width: 760px; margin: 0 auto; padding: 30px 30px; }
  header { margin-bottom: 20px; }
  header h1 { font-size: 20px; font-weight: 700; margin-bottom: 2px; }
  header .contact { font-size: 10.5px; color: #555; }
  header .contact span { margin-right: 12px; }
  section { margin-bottom: 14px; }
  h2 { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
       color: #555; margin-bottom: 7px; }
  .summary-text { font-size: 10.5px; color: #333; }
  .entry { margin-bottom: 9px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline;
                  font-size: 10.5px; flex-wrap: wrap; margin-bottom: 3px; color: #333; }
  .entry-header span:last-child { font-size: 10px; color: #666; white-space: nowrap; }
  ul { padding-left: 15px; }
  ul li { font-size: 10.5px; color: #222; margin-bottom: 2px; }
  .meta { font-size: 10px; color: #666; margin-top: 2px; }
  .skills-line { font-size: 10.5px; line-height: 1.7; }
  a { color: #111; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${esc(user.fullName)}</h1>
    <div class="contact">
      <span>${esc(user.email)}</span>
      ${user.university ? `<span>${esc(user.university)}${user.graduationYear ? ` · ${user.graduationYear}` : ''}</span>` : ''}
    </div>
  </header>
  ${content.summary ? `<section><h2>Summary</h2><p class="summary-text">${esc(content.summary)}</p></section>` : ''}
  ${experienceHtml}
  ${projectsHtml}
  ${educationHtml}
  ${skillsHtml}
  ${certsHtml}
</div>
</body>
</html>`;
};
