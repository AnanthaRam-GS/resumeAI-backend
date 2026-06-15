import type { ResumeRenderData } from '../types/resume.types.js';

const esc = (s: string | null | undefined): string =>
  (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const academicTemplate = (data: ResumeRenderData): string => {
  const { user, content } = data;

  const experienceHtml = content.experience.length
    ? `
      <section>
        <h2>Professional Experience</h2>
        ${content.experience
          .map(
            (exp) => `
          <div class="entry">
            <div class="entry-header">
              <div class="entry-left">
                <span class="entry-title">${esc(exp.role)}</span>
                <span class="entry-org">${esc(exp.company)}${exp.location ? `, ${esc(exp.location)}` : ''}</span>
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
        <h2>Research &amp; Projects</h2>
        ${content.projects
          .map(
            (proj) => `
          <div class="entry">
            <div class="entry-header">
              <div class="entry-left">
                <span class="entry-title">${esc(proj.name)}</span>
                ${proj.tech.length ? `<span class="entry-org">${proj.tech.map(esc).join(', ')}</span>` : ''}
              </div>
              ${proj.url ? `<a class="entry-date" href="${esc(proj.url)}">${esc(proj.url)}</a>` : ''}
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
              <div class="entry-left">
                <span class="entry-title">${esc(edu.institution)}</span>
                <span class="entry-org">${esc(edu.degree)}${edu.fieldOfStudy ? `, ${esc(edu.fieldOfStudy)}` : ''}</span>
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
        <h2>Technical Skills</h2>
        <table class="skills-table">
          ${skillsEntries
            .map(
              ([cat, vals]) =>
                `<tr><td class="skill-cat">${esc(cat)}</td><td>${vals.map(esc).join(' · ')}</td></tr>`,
            )
            .join('')}
        </table>
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
              <div class="entry-left">
                <span class="entry-title">${esc(cert.name)}</span>
                <span class="entry-org">${esc(cert.issuer)}</span>
              </div>
              <span class="entry-date">${esc(cert.date ?? '')}</span>
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
  body { font-family: Georgia, 'Times New Roman', Times, serif; font-size: 11px;
         color: #111; line-height: 1.5; background: #fff; }
  .page { max-width: 780px; margin: 0 auto; padding: 28px 32px; }
  header { text-align: center; border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 18px; }
  header h1 { font-size: 20px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase;
              margin-bottom: 5px; }
  header .contact { font-size: 10px; color: #444; font-family: Arial, sans-serif; }
  header .contact span { margin: 0 8px; }
  section { margin-bottom: 15px; }
  h2 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px;
       border-bottom: 1px solid #111; padding-bottom: 2px; margin-bottom: 10px; font-family: Arial, sans-serif; }
  .summary-text { font-size: 10.5px; color: #222; line-height: 1.6; }
  .entry { margin-bottom: 11px; }
  .entry-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 2px; }
  .entry-left { display: flex; flex-direction: column; }
  .entry-title { font-weight: 700; font-size: 11px; }
  .entry-org { font-size: 10.5px; color: #444; font-style: italic; }
  .entry-date { font-size: 10px; color: #444; white-space: nowrap; font-family: Arial, sans-serif; }
  ul { padding-left: 18px; margin-top: 4px; }
  ul li { font-size: 10.5px; margin-bottom: 2.5px; }
  .meta { font-size: 10px; color: #555; margin-top: 3px; font-family: Arial, sans-serif; }
  .skills-table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  .skills-table tr td { padding: 2px 6px 2px 0; vertical-align: top; }
  .skill-cat { font-weight: 700; white-space: nowrap; width: 140px; }
  a { color: #111; }
</style>
</head>
<body>
<div class="page">
  <header>
    <h1>${esc(user.fullName)}</h1>
    <div class="contact">
      <span>${esc(user.email)}</span>
      ${user.university ? `<span>${esc(user.university)}${user.graduationYear ? ` (${user.graduationYear})` : ''}</span>` : ''}
    </div>
  </header>
  ${content.summary ? `<section><h2>Objective</h2><p class="summary-text">${esc(content.summary)}</p></section>` : ''}
  ${educationHtml}
  ${experienceHtml}
  ${projectsHtml}
  ${skillsHtml}
  ${certsHtml}
</div>
</body>
</html>`;
};
