const abbreviateWords = (text: string, maxLen: number): string => {
  const words = text.trim().split(/\s+/);
  if (words.length === 1) {
    return (words[0] ?? '').replace(/[^a-zA-Z0-9]/g, '').slice(0, maxLen).toUpperCase();
  }
  return words
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, maxLen);
};

export const generateVersionLabel = (
  roleCategory: string,
  companyName: string,
  versionNumber: number,
): string => {
  const roleAbbr = abbreviateWords(roleCategory || 'Role', 4);
  const companySlug =
    companyName
      .replace(/[^a-zA-Z0-9\s]/g, '')
      .trim()
      .split(/\s+/)[0]
      ?.slice(0, 12) ?? 'Co';
  return `${roleAbbr}-${companySlug}-v${versionNumber}`;
};
