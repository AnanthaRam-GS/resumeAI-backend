import type { PortfolioItemType, ScoredItem, SelectedItem } from '../../types/ai.types.js';

export interface SelectionCaps {
	project?: number;
	experience?: number;
	education?: number;
	skill?: number;
	certification?: number;
	research_paper?: number;
}

const DEFAULT_CAPS: Required<SelectionCaps> = {
	project: 2,
	experience: 3,
	education: 2,
	skill: 6,
	certification: 3,
	research_paper: 2,
};

const typeKeyMap: Record<PortfolioItemType, keyof Required<SelectionCaps>> = {
	project: 'project',
	experience: 'experience',
	education: 'education',
	skill: 'skill',
	certification: 'certification',
	research_paper: 'research_paper',
};

export const selectPortfolioItems = (
	scoredItems: ScoredItem[],
	caps: SelectionCaps = {},
): SelectedItem[] => {
	const mergedCaps = {
		...DEFAULT_CAPS,
		...caps,
	};
	const counters: Record<keyof Required<SelectionCaps>, number> = {
		project: 0,
		experience: 0,
		education: 0,
		skill: 0,
		certification: 0,
		research_paper: 0,
	};

	const selected: SelectedItem[] = [];

	for (const scoredItem of scoredItems) {
		const bucket = typeKeyMap[scoredItem.item.type];
		if (counters[bucket] >= mergedCaps[bucket]) {
			continue;
		}

		counters[bucket] += 1;
		selected.push({
			...scoredItem,
			selectionRank: selected.length + 1,
		});
	}

	return selected;
};
