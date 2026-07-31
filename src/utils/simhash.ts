/**
 * 64-bit Simhash for near-duplicate resume detection.
 *
 * Two documents with Hamming distance ≤ NEAR_DUPLICATE_THRESHOLD share enough
 * content to be considered near-duplicates. Exact content duplicates are caught
 * earlier by the SHA-256 canonical hash, so simhash only sees genuinely different
 * documents.
 */

export const NEAR_DUPLICATE_THRESHOLD = 10; // bits out of 64

// FNV-1a 32-bit — fast, good distribution for short tokens
const fnv1a32 = (str: string): number => {
	let hash = 2166136261;
	for (let i = 0; i < str.length; i++) {
		hash ^= str.charCodeAt(i);
		hash = Math.imul(hash, 16777619) >>> 0;
	}
	return hash;
};

const tokenize = (text: string): string[] =>
	text
		.toLowerCase()
		.replace(/[^\w\s]/g, ' ')
		.split(/\s+/)
		.filter((t) => t.length > 2); // skip very short tokens

// Popcount lookup for nibbles (0–15)
const POPCOUNT4 = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/**
 * Compute a 64-bit simhash fingerprint returned as a 16-char hex string.
 */
export const computeSimhash = (text: string): string => {
	const tokens = tokenize(text);
	const v: number[] = Array.from({ length: 64 }, () => 0);

	for (const token of tokens) {
		// Two independent 32-bit hashes cover all 64 bit positions
		const h1 = fnv1a32(token);
		const h2 = fnv1a32(token + '\x00');

		for (let b = 0; b < 32; b++) {
			v[b] = (v[b] ?? 0) + ((h1 & (1 << b)) ? 1 : -1);
		}
		for (let b = 0; b < 32; b++) {
			v[32 + b] = (v[32 + b] ?? 0) + ((h2 & (1 << b)) ? 1 : -1);
		}
	}

	// Collapse weighted vector into 8 bytes (64 bits)
	let hex = '';
	for (let byte = 0; byte < 8; byte++) {
		let octet = 0;
		for (let bit = 0; bit < 8; bit++) {
			if ((v[byte * 8 + bit] ?? 0) > 0) octet |= 1 << bit;
		}
		hex += octet.toString(16).padStart(2, '0');
	}
	return hex;
};

/**
 * Hamming distance between two 16-char hex simhashes.
 */
export const hammingDistance = (a: string, b: string): number => {
	let dist = 0;
	for (let i = 0; i < 16; i++) {
		const nibble = (parseInt(a[i] ?? '0', 16) ^ parseInt(b[i] ?? '0', 16)) & 0xf;
		dist += POPCOUNT4[nibble] ?? 0;
	}
	return dist;
};

/**
 * Return the closest existing simhash and its distance, or null if none found.
 */
export const findNearestSimhash = (
	candidate: string,
	existing: Array<{ id: string; simhash: string }>,
): { id: string; distance: number } | null => {
	let nearest: { id: string; distance: number } | null = null;

	for (const { id, simhash } of existing) {
		const dist = hammingDistance(candidate, simhash);
		if (dist <= NEAR_DUPLICATE_THRESHOLD && (!nearest || dist < nearest.distance)) {
			nearest = { id, distance: dist };
		}
	}

	return nearest;
};
