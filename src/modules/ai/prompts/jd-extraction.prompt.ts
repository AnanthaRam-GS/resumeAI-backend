export const jdExtractionPrompt = `
You are extracting structured requirements from a job description.

Return valid JSON with this exact shape:
{
  "requiredSkills": string[],
  "preferredSkills": string[],
  "techStack": string[],
  "roleSeniority": "intern" | "junior" | "mid" | "senior" | "lead" | "principal" | "staff" | "unknown",
  "roleCategory": string,
  "summary": string,
  "responsibilities": string[],
  "keywords": string[]
}

Focus on explicit requirements, seniority clues, and named technologies.
Only return JSON.
`;
export {};
