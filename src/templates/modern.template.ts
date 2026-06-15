import type { ResumeRenderData } from '../types/resume.types.js';

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const modernTemplate = (data: ResumeRenderData): string => {
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
              <div>
                <span class="entry-title">${esc(exp.role)}</span>
                <span class="entry-org"> · ${esc(exp.company)}</span>
                ${exp.location ? `<span class="entry-org"> · ${esc(exp.location)}</span>` : ''}
              </div>
              <span class="entry-date">${esc(exp.startDate)} – ${exp.isCurrent ? 'Present' : esc(exp.endDate ?? '')}</span>
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
              <div>
                <span class="entry-title">${esc(proj.name)}</span>
                ${proj.url ? `<span class="entry-org"> · <a href="${esc(proj.url)}">${esc(proj.url)}</a></span>` : ''}
              </div>
              ${proj.tech.length ? `<span class="tech-tags">${proj.tech.map(esc).join(' · ')}</span>` : ''}
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
              <div>
                <span class="entry-title">${esc(edu.degree)}${edu.fieldOfStudy ? ` in ${esc(edu.fieldOfStudy)}` : ''}</span>
                <span class="entry-org"> · ${esc(edu.institution)}</span>
              </div>
              <span class="entry-date">${esc(edu.startDate ?? '')}${edu.endDate ? ` – ${esc(edu.endDate)}` : ''}</span>
            </div>
            ${edu.gpa ? `<p class="meta">GPA: ${esc(edu.gpa)}</p>` : ''}
            ${edu.achievements ? `<p class="meta">${esc(edu.achievements)}</p>` : ''}
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
        <div class="skills-grid">
          ${skillsEntries
            .map(
              ([cat, vals]) =>
                `<div><span class="skill-cat">${esc(cat)}:</span> ${vals.map(esc).join(', ')}</div>`,
            )
            .join('')}
        </div>
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
              <span class="entry-title">${esc(cert.name)}</span>
              <span class="entry-date">${esc(cert.date ?? '')}</span>
            </div>
            <p class="meta">${esc(cert.issuer)}${cert.url ? ` · <a href="${esc(cert.url)}">${esc(cert.url)}</a>` : ''}</p>
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
         font-size: 11px; color: #1a1a1a; line-height: 1.45; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 0; }
  header { background: #1e3a5f; color: #fff; padding: 22px 28px 18px; }
  header h1 { font-size: 22px; font-weight: 700; letter-spacing: 0.3px; margin-bottom: 4px; }
  header .contact { font-size: 10.5px; opacity: 0.88; }
  header .contact span { margin-right: 14px; }
  main { padding: 20px 28px; }
  section { margin-bottom: 16px; }
  h2 { font-size: 11.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.8px;
       color: #1e3a5f; border-bottom: 1.5px solid #1e3a5f; padding-bottom: 3px; margin-bottom: 9px; }
  .summary-text { font-size: 10.5px; color: #333; line-height: 1.55; }
  .entry { margin-bottom: 10px; }
  .entry-header { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap;
                  margin-bottom: 4px; }
  .entry-title { font-weight: 700; font-size: 11px; color: #1a1a1a; }
  .entry-org { font-size: 10.5px; color: #555; }
  .entry-date { font-size: 10px; color: #666; white-space: nowrap; }
  .tech-tags { font-size: 10px; color: #1e3a5f; font-style: italic; }
  ul { padding-left: 16px; margin-top: 3px; }
  ul li { font-size: 10.5px; color: #2a2a2a; margin-bottom: 2px; }
  .meta { font-size: 10px; color: #555; margin-top: 3px; }
  .skills-grid { display: flex; flex-direction: column; gap: 3px; }
  .skills-grid div { font-size: 10.5px; }
  .skill-cat { font-weight: 700; color: #1a1a1a; }
  a { color: #1e3a5f; text-decoration: none; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${esc(user.fullName)}</h1>
    <div class="contact">
      <span>${esc(user.email)}</span>
      ${user.university ? `<span>${esc(user.university)}${user.graduationYear ? ` '${String(user.graduationYear).slice(2)}` : ''}</span>` : ''}
    </div>
  </header>
  <main>
    ${content.summary ? `<section><h2>Summary</h2><p class="summary-text">${esc(content.summary)}</p></section>` : ''}
    ${experienceHtml}
    ${projectsHtml}
    ${educationHtml}
    ${skillsHtml}
    ${certsHtml}
  </main>
</div>
</body>
</html>`;
};
