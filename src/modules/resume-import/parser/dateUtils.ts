const MONTHS: Record<string, string> = {
	jan: '01',
	january: '01',
	feb: '02',
	february: '02',
	mar: '03',
	march: '03',
	apr: '04',
	april: '04',
	may: '05',
	jun: '06',
	june: '06',
	jul: '07',
	july: '07',
	aug: '08',
	august: '08',
	sep: '09',
	sept: '09',
	september: '09',
	oct: '10',
	october: '10',
	nov: '11',
	november: '11',
	dec: '12',
	december: '12',
};

export const parseMonthYear = (value: string): string | undefined => {
	const normalized = value.trim().toLowerCase().replace(/[,]/g, '');
	const monthYear = normalized.match(
		/\b(january|february|march|april|may|june|july|august|september|sept|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec)\s+((?:19|20)\d{2})\b/i,
	);
	if (monthYear) return `${monthYear[2]}-${MONTHS[monthYear[1]!.toLowerCase()] ?? '01'}-01`;

	const numericMonthYear = normalized.match(/\b((?:19|20)\d{2})[-/](0?[1-9]|1[0-2])\b/);
	if (numericMonthYear) return `${numericMonthYear[1]}-${numericMonthYear[2]!.padStart(2, '0')}-01`;

	const year = normalized.match(/\b((?:19|20)\d{2})\b/);
	if (year) return `${year[1]}-01-01`;
	return undefined;
};

export const parseDateRange = (
	text: string,
): { start_date?: string; end_date?: string; is_current?: boolean } => {
	const range = text.match(
		/((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2})\s*(?:-|to|–|—)\s*((?:(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+)?(?:19|20)\d{2}|present|current|now|ongoing)/i,
	);
	if (!range) return {};
	const isCurrent = /present|current|now|ongoing/i.test(range[2] ?? '');
	return {
		start_date: parseMonthYear(range[1] ?? ''),
		...(isCurrent ? { is_current: true } : { end_date: parseMonthYear(range[2] ?? '') }),
	};
};

export const parseYearRange = (text: string): { start_date?: string; end_date?: string } => {
	const range = text.match(/\b((?:19|20)\d{2})\s*(?:-|to|–|—)\s*((?:19|20)\d{2})\b/i);
	if (!range) return {};
	return {
		start_date: `${range[1]}-01-01`,
		end_date: `${range[2]}-01-01`,
	};
};
