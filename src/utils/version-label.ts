const STOP_WORDS = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'in', 'at', 'to', 'by']);

const abbreviateTitle = (jobTitle: string): string => {
  return jobTitle
    .split(/[\s/-]+/)
    .filter((word) => word.length > 0 && !STOP_WORDS.has(word.toLowerCase()))
    .map((word) => (word[0] ?? '').toUpperCase())
    .join('')
    .slice(0, 5) || 'JOB';
};

const sanitizeCompany = (companyName: string): string => {
  return companyName
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 10) || 'Co';
};

export const generateVersionLabel = (
  jobTitle: string,
  companyName: string,
  versionNumber: number,
): string => {
  const abbr = abbreviateTitle(jobTitle);
  const company = sanitizeCompany(companyName);
  return `${abbr}-${company}-v${versionNumber}`;
};
