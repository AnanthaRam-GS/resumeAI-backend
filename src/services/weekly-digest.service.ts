import { pool } from '../db/client.js';
import { sendEmail } from './email.service.js';

export const sendWeeklyDigest = async (userId: string): Promise<'sent' | 'skipped'> => {
  const userResult = await pool.query<{
    email: string;
    full_name: string;
    career_goal: string | null;
    weekly_digest_opt_in: boolean;
    last_weekly_digest_sent_at: Date | null;
  }>(
    `SELECT email, full_name, career_goal, weekly_digest_opt_in, last_weekly_digest_sent_at
     FROM users
     WHERE id = $1`,
    [userId],
  );
  const user = userResult.rows[0];
  if (!user?.weekly_digest_opt_in) return 'skipped';
  if (user.last_weekly_digest_sent_at && Date.now() - user.last_weekly_digest_sent_at.getTime() < 6 * 24 * 60 * 60 * 1000) {
    return 'skipped';
  }

  const portfolio = await pool.query<{ count: string; avg_score: string | null }>(
    `SELECT COUNT(*)::text AS count, AVG(validation_score)::text AS avg_score
     FROM portfolio_items
     WHERE user_id = $1`,
    [userId],
  );
  const gap = await pool.query<{ overall_assessment: string | null }>(
    `SELECT overall_assessment
     FROM gap_analyses
     WHERE user_id = $1
     ORDER BY generated_at DESC
     LIMIT 1`,
    [userId],
  );

  const count = portfolio.rows[0]?.count ?? '0';
  const avg = portfolio.rows[0]?.avg_score ? Math.round(Number(portfolio.rows[0].avg_score)) : null;
  const assessment = gap.rows[0]?.overall_assessment ?? 'Refresh Gap Advisor this week for a more specific recommendation.';
  const html = `
    <h1>Your weekly career advisor highlights</h1>
    <p>Hi ${user.full_name},</p>
    <p>Your portfolio currently has ${count} items${avg !== null ? ` with an average portfolio-quality indicator of ${avg}` : ''}.</p>
    <p>${assessment}</p>
    <p>Career goal: ${user.career_goal ?? 'Not set yet.'}</p>
    <p>You can change email preferences from Settings.</p>
  `;

  await sendEmail({
    to: user.email,
    subject: 'Your weekly ResumeAI career highlights',
    html,
    text: `Your portfolio has ${count} items. ${assessment}`,
  });

  await pool.query(
    `UPDATE users SET last_weekly_digest_sent_at = NOW() WHERE id = $1`,
    [userId],
  );
  return 'sent';
};

