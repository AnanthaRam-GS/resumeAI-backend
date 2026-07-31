import { describe, expect, it } from 'vitest';
import { normalizeResumeParserMode } from '../../src/config/parserConfig.js';
import {
  cleanProjectTitle,
  extractResearchPapers,
  isValidLocationCandidate,
  normalizeSkillName,
  RESUME_PARSER_VERSION,
  segmentSections,
} from '../../src/modules/resume-import/parser/index.js';
import { deduplicateParsedData } from '../../src/modules/resume-import/parser/deduplicateParsedData.js';
import { extractEducation } from '../../src/modules/resume-import/parser/extractEducation.js';
import { extractPersonalInfo } from '../../src/modules/resume-import/parser/extractPersonalInfo.js';
import {
  extractProjects,
  isProjectTitleCandidate,
} from '../../src/modules/resume-import/parser/extractProjects.js';
import { extractSkills } from '../../src/modules/resume-import/parser/extractSkills.js';
import { linesFromText } from '../../src/modules/resume-import/parser/utils.js';
import type { ParserContext } from '../../src/modules/resume-import/parser/types.js';

const contextFor = (text: string): ParserContext => {
  const lines = linesFromText(text);
  return {
    fileName: 'synthetic.pdf',
    fileType: 'pdf',
    text,
    lines,
    sections: segmentSections(lines),
    links: [],
    warnings: [],
  };
};

describe('resume parser v2 deterministic stages', () => {
  it('rejects summary text as a location candidate', () => {
    expect(isValidLocationCandidate('Coimbatore, India')).toBe(true);
    expect(
      isValidLocationCandidate('AI engineering student specializing in deep learning frameworks'),
    ).toBe(false);
  });

  it('does not map gmail.com as a portfolio URL', () => {
    const context = contextFor(`
			Jane Doe
			jane@gmail.com | AI engineering student specializing in deep learning frameworks
			Summary
			Full-stack developer building health AI products with React and Node.js.
		`);
    context.links.push({
      displayText: 'gmail.com',
      url: 'gmail.com',
      normalizedUrl: 'https://gmail.com',
      kind: 'email_domain',
    });
    const { personal } = extractPersonalInfo(context);
    expect(personal.location).toBeUndefined();
    expect(personal.portfolio_url).toBeUndefined();
    expect(personal.summary).toContain('Full-stack developer');
  });

  it('splits education degree, field, institution, location, dates, and GPA', () => {
    const context = contextFor(`
			Education
			2023 – 2027 B.Tech, Computer Science and Engineering CGPA: 7.71/10
			Amrita Vishwa Vidyapeetham, Coimbatore
		`);
    expect(extractEducation(context)[0]).toMatchObject({
      degree: 'B.Tech',
      field_of_study: 'Computer Science and Engineering',
      institution_name: 'Amrita Vishwa Vidyapeetham',
      location: 'Coimbatore',
      start_date: '2023-01-01',
      end_date: '2027-01-01',
      gpa: '7.71/10',
    });
  });

  it('cleans project link labels and assigns embedded project links', () => {
    const context = contextFor(`
			Projects
			CFRL-Enabled Edge-Cloud Sepsis Prediction Framework Link to Project
			Built LSTM and GRU models with Genetic Algorithms and Knowledge Distillation.
		`);
    context.links.push({
      displayText: 'Link to Project',
      url: 'https://example.com/sepsis',
      normalizedUrl: 'https://example.com/sepsis',
      kind: 'project',
      nearbyText: 'CFRL-Enabled Edge-Cloud Sepsis Prediction Framework Link to Project',
    });
    const project = extractProjects(context)[0];
    expect(project).toMatchObject({
      title: 'CFRL-Enabled Edge-Cloud Sepsis Prediction Framework',
      project_url: 'https://example.com/sepsis',
    });
    expect(cleanProjectTitle('Demo App Link to Project')).toBe('Demo App');
  });

  it('does not promote action-verb bullets into project titles or leak adjacent GitHub links', () => {
    const context = contextFor(`
			Projects
			CFRL-Enabled Edge-Cloud Sepsis Prediction Framework [Link to Project](https://github.com/23CSE362-edge-computing-2025-26-odd/capstone-project-04_edgezilla.git) Developed a hybrid Computational Intelligence framework using LSTMs and Genetic Algorithms to capture nonlinear temporal patterns for early sepsis detection.
			Applied Knowledge Distillation to compress cloud-trained LSTM intelligence into lightweight GRU models, achieving 99.9% performance retention for real-time edge deployment.
			Hive Mind – Robotic Swarm Foraging Simulation [Link to Project](https://github.com/M-krizz/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION.git)
			Engineered a bio-inspired multi-agent system using a Finite-State Machine (FSM) to coordinate au- tonomous foraging and homing behaviors in e-puck robots.
			Implemented Particle Swarm Optimization (PSO) principles and emitter-receiver communication to enable adaptive memory-driven exploration and cooperative information sharing.
		`);
    context.links.push(
      {
        displayText: 'Link to Project',
        url: 'https://github.com/23CSE362-edge-computing-2025-26-odd/capstone-project-04_edgezilla.git',
        normalizedUrl:
          'https://github.com/23CSE362-edge-computing-2025-26-odd/capstone-project-04_edgezilla.git',
        kind: 'github_repo',
        nearbyText: 'CFRL-Enabled Edge-Cloud Sepsis Prediction Framework Link to Project',
      },
      {
        displayText: 'Link to Project',
        url: 'https://github.com/M-krizz/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION.git',
        normalizedUrl:
          'https://github.com/M-krizz/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION.git',
        kind: 'github_repo',
        nearbyText: 'Hive Mind – Robotic Swarm Foraging Simulation Link to Project',
      },
    );

    const projects = extractProjects(context);
    expect(projects).toHaveLength(2);
    expect(projects[0]).toMatchObject({
      title: 'CFRL-Enabled Edge-Cloud Sepsis Prediction Framework',
      github_url:
        'https://github.com/23CSE362-edge-computing-2025-26-odd/capstone-project-04_edgezilla.git',
    });
    expect(projects[0]?.description).toContain(
      'Developed a hybrid Computational Intelligence framework',
    );
    expect(projects[0]?.description).toContain('Applied Knowledge Distillation');
    expect(projects[1]).toMatchObject({
      title: 'Hive Mind – Robotic Swarm Foraging Simulation',
      github_url: 'https://github.com/M-krizz/HIVE_MIND_A_ROBOTIC_SWARM_FORAGING_SIMULATION.git',
    });
    expect(projects[1]?.description).toContain('autonomous foraging');
    expect(projects.map((project) => project.title)).not.toContain(
      'Developed a hybrid Computational Intelligence framework using LSTMs and Genetic Algorithms to',
    );
    expect(projects[0]?.github_url).not.toBe(projects[1]?.github_url);
  });

  it('rejects sentence-like project titles and attaches descriptions to the valid project', () => {
    expect(isProjectTitleCandidate('map-based projects to specific job descriptions.')).toBe(false);
    expect(
      isProjectTitleCandidate(
        'Built a resume parser to map projects to specific job descriptions.',
      ),
    ).toBe(false);
    expect(isProjectTitleCandidate('Intelligent Resume Management & Adaptive ATS System')).toBe(
      true,
    );

    const context = contextFor(`
			Projects
			Intelligent Resume Management & Adaptive ATS System
			Built a resume parser to map projects to specific job descriptions using relevance scoring and ATS keyword matching.
			map-based projects to specific job descriptions.
		`);

    const projects = extractProjects(context);
    expect(projects).toHaveLength(1);
    expect(projects[0]?.title).toBe('Intelligent Resume Management & Adaptive ATS System');
    expect(projects[0]?.description).toContain(
      'Built a resume parser to map projects to specific job descriptions',
    );
    expect(projects[0]?.description).toContain('map-based projects to specific job descriptions.');
    expect(projects.map((project) => project.title)).not.toContain(
      'map-based projects to specific job descriptions.',
    );
  });

  it('extracts research papers separately with DOI, arXiv, publication, and code links', () => {
    const context = contextFor(`
			Research Papers
			CFRL-Enabled Edge-Cloud Sepsis Prediction Framework by Jane Doe, John Smith in IEEE Conference on Health AI, 2025. DOI: 10.1109/HEALTHAI.2025.1234567 arXiv: 2501.12345 Published.
			Code: https://github.com/example/sepsis-paper
			Publication: https://ieeexplore.ieee.org/document/1234567
		`);
    context.links.push(
      {
        displayText: 'Code',
        url: 'https://github.com/example/sepsis-paper',
        normalizedUrl: 'https://github.com/example/sepsis-paper',
        kind: 'github_repo',
        nearbyText: 'Code: https://github.com/example/sepsis-paper',
      },
      {
        displayText: 'Publication',
        url: 'https://ieeexplore.ieee.org/document/1234567',
        normalizedUrl: 'https://ieeexplore.ieee.org/document/1234567',
        kind: 'publication',
        nearbyText: 'Publication: https://ieeexplore.ieee.org/document/1234567',
      },
    );

    expect(extractProjects(context)).toHaveLength(0);
    const papers = extractResearchPapers(context);
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: 'CFRL-Enabled Edge-Cloud Sepsis Prediction Framework',
      authors: ['Jane Doe', 'John Smith'],
      venue: expect.stringContaining('IEEE Conference on Health AI'),
      year: '2025',
      doi: '10.1109/HEALTHAI.2025.1234567',
      arxivUrl: 'https://arxiv.org/abs/2501.12345',
      publicationUrl: 'https://ieeexplore.ieee.org/document/1234567',
      githubUrl: 'https://github.com/example/sepsis-paper',
      status: 'published',
    });
  });

  it('keeps a research paper and its descriptive sentence as one entry', () => {
    const context = contextFor(`
			Research Papers
			Comparative Analysis of Carbon Footprint Predictions for Electronic Product Categories, 2025.
			Authored a research paper evaluating Random Forest, Federated Learning, and Contrastive Learning for carbon footprint prediction.
		`);

    const papers = extractResearchPapers(context);
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: 'Comparative Analysis of Carbon Footprint Predictions for Electronic Product Categories',
      year: '2025',
      abstract:
        'Authored a research paper evaluating Random Forest, Federated Learning, and Contrastive Learning for carbon footprint prediction.',
    });
    expect(papers.map((paper) => paper.title)).not.toContain(
      'Authored a research paper evaluating Random Forest, Federated Learning, and Contrastive Learning',
    );
  });

  it('attaches embedded research links by display text when URLs are not visible in the text', () => {
    const context = contextFor(`
			Research Papers
			Comparative Analysis of Carbon Footprint Predictions for Electronic Product Categories Publication Code
			Authors: Tejeshwar CDR
			Published in International Conference on Sustainable Computing, 2025.
		`);
    context.links.push(
      {
        displayText: 'Publication',
        url: 'https://example.org/papers/carbon-footprint',
        normalizedUrl: 'https://example.org/papers/carbon-footprint',
        kind: 'unknown',
        nearbyText: 'Publication',
      },
      {
        displayText: 'Code',
        url: 'https://github.com/example/carbon-footprint-paper',
        normalizedUrl: 'https://github.com/example/carbon-footprint-paper',
        kind: 'github_repo',
        nearbyText: 'Code',
      },
    );

    const papers = extractResearchPapers(context);
    expect(papers).toHaveLength(1);
    expect(papers[0]).toMatchObject({
      title: 'Comparative Analysis of Carbon Footprint Predictions for Electronic Product Categories',
      authors: ['Tejeshwar CDR'],
      publicationUrl: 'https://example.org/papers/carbon-footprint',
      githubUrl: 'https://github.com/example/carbon-footprint-paper',
    });
    expect(papers[0]?.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ normalizedUrl: 'https://example.org/papers/carbon-footprint' }),
        expect.objectContaining({ normalizedUrl: 'https://github.com/example/carbon-footprint-paper' }),
      ]),
    );
  });

  it('bumps parser version to invalidate bad project caches', () => {
    expect(RESUME_PARSER_VERSION).toBe('resume-import-parser-v2.3.1-research-paper-links:hybrid');
  });

  it('normalizes parser mode aliases and defaults invalid values to hybrid', () => {
    expect(normalizeResumeParserMode('rules')).toMatchObject({
      mode: 'rule-based',
      usedDefault: false,
    });
    expect(normalizeResumeParserMode('llm')).toMatchObject({
      mode: 'llm-only',
      usedDefault: false,
    });
    expect(normalizeResumeParserMode('hybrid')).toMatchObject({
      mode: 'hybrid',
      usedDefault: false,
    });
    expect(normalizeResumeParserMode(undefined)).toMatchObject({
      mode: 'hybrid',
      usedDefault: true,
      reason: 'missing',
    });
    expect(normalizeResumeParserMode('not-a-mode')).toMatchObject({
      mode: 'hybrid',
      usedDefault: true,
      reason: 'invalid',
    });
  });

  it('normalizes and deduplicates skills', () => {
    const context = contextFor(`
			Skills
			Frontend: React.js, ReactJS, Javascript
			Backend: Node, NodeJS, Postgres, PostgreSQL
		`);
    const skills = extractSkills(context).map((skill) => skill.skill_name);
    expect(skills).toEqual(
      expect.arrayContaining(['React', 'JavaScript', 'Node.js', 'PostgreSQL']),
    );
    expect(normalizeSkillName('ai')).toBe('Artificial Intelligence');
    expect(normalizeSkillName('ml')).toBe('Machine Learning');
    expect(normalizeSkillName('genetic algorithm')).toBe('Genetic Algorithms');
    const deduped = deduplicateParsedData({
      skills: [
        { title: 'React', skill_name: normalizeSkillName('React.js') },
        { title: 'React', skill_name: normalizeSkillName('ReactJS') },
      ],
      extractedLinks: [],
      warnings: [],
      confidence: {
        overall: 0.8,
        personalInfo: 0.8,
        education: 0.8,
        experience: 0.8,
        projects: 0.8,
        skills: 0.8,
        certifications: 0.8,
      },
    });
    expect(deduped.skills).toHaveLength(1);
  });
});
