import { pool } from '../db/client.js';
import { generateEmbedding } from './embedding.service.js';

export interface SemanticPortfolioScore {
  id: string;
  semanticScore: number;
}

export const scorePortfolioBySemanticSimilarity = async (
  userId: string,
  jobDescription: string,
): Promise<SemanticPortfolioScore[]> => {
  try {
    const embedding = await generateEmbedding(jobDescription, 'portfolio_semantic_retrieval');
    const vector = `[${embedding.join(',')}]`;
    const result = await pool.query<{ id: string; similarity: number }>(
      `SELECT id, 1 - (embedding <=> $1::vector) AS similarity
       FROM portfolio_items
       WHERE user_id = $2 AND embedding IS NOT NULL
       ORDER BY embedding <=> $1::vector
       LIMIT 100`,
      [vector, userId],
    );
    return result.rows.map((row) => ({
      id: row.id,
      semanticScore: Math.max(0, Math.min(1, Number(row.similarity))),
    }));
  } catch {
    return [];
  }
};

