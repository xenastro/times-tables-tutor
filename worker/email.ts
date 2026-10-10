/**
 * Sending email, kept pluggable. The live site uses Cloudflare Email Service through the
 * `EMAIL` binding (wrangler.jsonc), sending from noreply@ashra.aburaddad.com:
 *
 *   EMAIL_PROVIDER=cloudflare  EMAIL_FROM=noreply@ashra.aburaddad.com   (Worker vars)
 *
 * Resend also works: EMAIL_PROVIDER=resend, RESEND_API_KEY=..., EMAIL_FROM="Ashra <noreply@…>".
 * With no provider, `sendEmail` returns false and, when EMAIL_LOG_LINKS=1 (local development
 * only), logs the message instead.
 */

export interface EmailEnv {
  EMAIL_PROVIDER?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  /** Cloudflare Email Service. */
  EMAIL?: SendEmail;
  /**
   * Development only (.dev.vars): print emails to the Worker log, and return reset links to the
   * local test scripts. Never set this on the live Worker.
   */
  EMAIL_LOG_LINKS?: string;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export function emailConfigured(env: EmailEnv): boolean {
  if (env.EMAIL_PROVIDER === 'cloudflare') return !!env.EMAIL && !!env.EMAIL_FROM;
  return env.EMAIL_PROVIDER === 'resend' && !!env.RESEND_API_KEY && !!env.EMAIL_FROM;
}

/** Returns true if the message was handed to a provider. */
export async function sendEmail(env: EmailEnv, msg: EmailMessage): Promise<boolean> {
  if (env.EMAIL_PROVIDER === 'cloudflare' && env.EMAIL && env.EMAIL_FROM) {
    try {
      await env.EMAIL.send({ from: { name: 'Ashra', email: env.EMAIL_FROM }, to: msg.to, subject: msg.subject, text: msg.text });
      return true;
    } catch (err) {
      console.error('email failed', err);
      return false;
    }
  }
  if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY && env.EMAIL_FROM) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [msg.to], subject: msg.subject, text: msg.text }),
    });
    if (!res.ok) console.error('email failed', res.status, await res.text());
    return res.ok;
  }
  if (env.EMAIL_LOG_LINKS === '1') console.log(`[email to ${msg.to}] ${msg.subject}\n${msg.text}`);
  return false;
}
