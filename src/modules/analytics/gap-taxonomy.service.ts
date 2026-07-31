import { readFileSync } from 'fs';
import { join } from 'path';

interface SkillTaxonomyCluster {
  name: string;
  skills: string[];
  prerequisites: string[];
  seniorityGate: string;
}

interface CareerGoalMap {
  pattern: string;
  requiredClusters: { cluster: string; weight: number }[];
}

interface FullTaxonomy {
  groups: Array<{ name: string; skills: Array<{ name: string; synonyms?: string[] }> }>;
  clusters: SkillTaxonomyCluster[];
  careerGoalMaps: CareerGoalMap[];
}

let taxonomyCache: FullTaxonomy | null = null;

export const loadSkillTaxonomy = (): FullTaxonomy => {
  if (taxonomyCache) return taxonomyCache;
  const filePath = join(process.cwd(), 'src', 'data', 'skills-taxonomy.json');
  const raw = readFileSync(filePath, 'utf-8');
  taxonomyCache = JSON.parse(raw) as FullTaxonomy;
  return taxonomyCache;
};

export const resolveSkillCluster = (skill: string): SkillTaxonomyCluster | null => {
  const taxonomy = loadSkillTaxonomy();
  const skillLower = skill.toLowerCase();
  return taxonomy.clusters.find(cluster =>
    cluster.skills.some(s => s.toLowerCase() === skillLower),
  ) ?? null;
};

export const mapCareerGoalToSkills = (careerGoal: string): { skill: string; frequency: number }[] => {
  const taxonomy = loadSkillTaxonomy();
  const goalLower = careerGoal.toLowerCase();

  const matchedMap = taxonomy.careerGoalMaps.find(map =>
    goalLower.includes(map.pattern.toLowerCase()),
  );

  if (!matchedMap) {
    return extractSkillsFromText(careerGoal);
  }

  const skillFrequencies = new Map<string, number>();

  for (const { cluster, weight } of matchedMap.requiredClusters) {
    const clusterDef = taxonomy.clusters.find(c => c.name === cluster);
    if (!clusterDef) continue;
    for (const skill of clusterDef.skills) {
      const existing = skillFrequencies.get(skill) ?? 0;
      skillFrequencies.set(skill, Math.max(existing, weight));
    }
  }

  return Array.from(skillFrequencies.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, 15)
    .map(([skill, frequency]) => ({ skill, frequency }));
};

const extractSkillsFromText = (text: string): { skill: string; frequency: number }[] => {
  const taxonomy = loadSkillTaxonomy();
  const textLower = text.toLowerCase();
  const found: { skill: string; frequency: number }[] = [];

  for (const group of taxonomy.groups) {
    for (const skillDef of group.skills) {
      const allNames = [skillDef.name, ...(skillDef.synonyms ?? [])];
      const matches = allNames.some(name => textLower.includes(name.toLowerCase()));
      if (matches) {
        found.push({ skill: skillDef.name, frequency: 0.5 });
      }
    }
  }

  return found;
};

export const getPrerequisiteOrder = (skills: string[]): Map<string, number> => {
  const taxonomy = loadSkillTaxonomy();
  const orderMap = new Map<string, number>();
  const skillSet = new Set(skills.map(s => s.toLowerCase()));
  const processed = new Set<string>();
  const remaining = new Set(skills);
  let currentOrder = 1;

  const resolvePrerequisiteSkills = (skill: string): string[] => {
    const cluster = resolveSkillCluster(skill);
    if (!cluster) return [];

    return cluster.prerequisites.flatMap((prerequisite) => {
      if (prerequisite.toLowerCase() === skill.toLowerCase()) return [];

      const prerequisiteCluster = taxonomy.clusters.find(
        candidate => candidate.name.toLowerCase() === prerequisite.toLowerCase(),
      );

      if (prerequisiteCluster) {
        return prerequisiteCluster.skills.filter(
          prerequisiteSkill => prerequisiteSkill.toLowerCase() !== skill.toLowerCase(),
        );
      }

      return [prerequisite];
    });
  };

  while (remaining.size > 0) {
    const batch: string[] = [];

    for (const skill of remaining) {
      const prereqsInList = resolvePrerequisiteSkills(skill).filter(p =>
        skillSet.has(p.toLowerCase()),
      );
      const prereqsProcessed = prereqsInList.every(p =>
        processed.has(p.toLowerCase()),
      );

      if (prereqsProcessed) {
        batch.push(skill);
      }
    }

    if (batch.length === 0) {
      for (const skill of remaining) {
        orderMap.set(skill, currentOrder);
      }
      break;
    }

    for (const skill of batch) {
      orderMap.set(skill, currentOrder);
      processed.add(skill.toLowerCase());
      remaining.delete(skill);
    }

    currentOrder++;
  }

  return orderMap;
};

export const aggregateJdSkills = (
  extractedSkillSets: string[][],
): { skill: string; frequency: number }[] => {
  const totalJds = extractedSkillSets.length;
  if (totalJds === 0) return [];

  const skillCounts = new Map<string, number>();

  for (const skillSet of extractedSkillSets) {
    for (const skill of skillSet) {
      const normalized = skill.trim();
      if (!normalized) continue;
      skillCounts.set(normalized, (skillCounts.get(normalized) ?? 0) + 1);
    }
  }

  return Array.from(skillCounts.entries())
    .map(([skill, count]) => ({ skill, frequency: count / totalJds }))
    .filter(s => s.frequency >= 0.2)
    .sort((a, b) => b.frequency - a.frequency)
    .slice(0, 20);
};
