export type PortfolioItemType =
	| 'project'
	| 'experience'
	| 'education'
	| 'skill'
	| 'certification';

export type PortfolioItemSource = 'manual' | 'upload' | 'github';

export type RoleSeniority =
	| 'intern'
	| 'junior'
	| 'mid'
	| 'senior'
	| 'lead'
	| 'principal'
	| 'staff'
	| 'unknown';

export interface ExtractedEntities {
	requiredSkills: string[];
	preferredSkills: string[];
	techStack: string[];
	roleSeniority: RoleSeniority;
	roleCategory: string;
	summary?: string;
	responsibilities?: string[];
	keywords?: string[];
}

export interface PortfolioItemRecord {
	id: string;
	user_id?: string;
	type: PortfolioItemType;
	source?: PortfolioItemSource;
	title: string;
	description?: string | null;
	start_date?: string | Date | null;
	end_date?: string | Date | null;
	is_current?: boolean | null;
	tech_stack?: string[] | null;
	project_url?: string | null;
	impact_metrics?: string | null;
	domain_category?: string | null;
	company_name?: string | null;
	employment_type?: string | null;
	location?: string | null;
	degree?: string | null;
	field_of_study?: string | null;
	institution_name?: string | null;
	gpa?: string | null;
	achievements?: string | null;
	issuing_org?: string | null;
	cert_url?: string | null;
	expiry_date?: string | Date | null;
	no_expiry?: boolean | null;
	skill_name?: string | null;
	document_s3_key?: string | null;
	document_filename?: string | null;
	validation_score?: number | string | null;
	extra?: Record<string, unknown> | null;
	created_at?: string | Date;
	updated_at?: string | Date;
}

export interface ScoredItem {
	item: PortfolioItemRecord;
	score: number;
	reasons: string[];
	matchedSkills: string[];
}

export interface SelectedItem extends ScoredItem {
	selectionRank: number;
}

export interface ATSFeedback {
	foundKeywords: string[];
	missingKeywords: string[];
	suggestions: string[];
}

export interface ATSResult extends ATSFeedback {
	score: number;
	matchedKeywords: string[];
}

export interface SkillTaxonomySkill {
	name: string;
	synonyms?: string[];
}

export interface SkillTaxonomyGroup {
	name: string;
	skills: SkillTaxonomySkill[];
}

export interface SkillTaxonomyFile {
	groups: SkillTaxonomyGroup[];
}
