import { NotFoundError } from '../../utils/errors.js';
import { getResumeVersion } from '../resume/resume.service.js';

export const getAtsDetails = async (
  userId: string,
  resumeVersionId: string,
): Promise<{
  resumeVersionId: string;
  atsScore: string | null;
  atsFeedback: {
    foundKeywords: string[];
    missingKeywords: string[];
    suggestions: string[];
  };
  versionLabel: string | null;
}> => {
  const version = await getResumeVersion(userId, resumeVersionId);

  if (version.ats_score === null) {
    throw new NotFoundError('ATS score not yet available for this resume version');
  }

  return {
    resumeVersionId: version.id,
    atsScore: version.ats_score,
    atsFeedback: version.ats_feedback,
    versionLabel: version.version_label,
  };
};
