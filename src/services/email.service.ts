import { Resend } from 'resend';
import { env } from '../config/env.js';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export const sendEmail = async (message: EmailMessage): Promise<{ provider: string; id?: string }> => {
  if (!resend) {
    process.stdout.write(`[email:no-op] ${JSON.stringify({ to: message.to, subject: message.subject })}\n`);
    return { provider: 'noop' };
  }

  const result = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: message.to,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  return { provider: 'resend', id: result.data?.id };
};
