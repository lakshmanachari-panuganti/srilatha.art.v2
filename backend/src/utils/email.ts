import nodemailer, { Transporter } from 'nodemailer';

// ---------------------------------------------------------------------------
// SMTP-based email sender.
//
// Mirrors the contract of sendWhatsApp: returns a structured result rather
// than throwing, so callers can decide whether a failed send is fatal
// (user-facing receipt) or best-effort (admin notification). The exact error
// detail is preserved on `detail` so the route can surface it instead of a
// generic "something went wrong".
//
// All configuration comes from app settings (env vars). DEV and PRD use the
// same code path — only the SMTP_* values differ between environments.
// ---------------------------------------------------------------------------

export type EmailSendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: 'not-configured' | 'smtp-error'; detail: string };

export interface SendEmailInput {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  replyTo?: string;
}

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  senderEmail: string;
  senderName: string;
  defaultReplyTo: string;
}

let cachedTransporter: Transporter | null = null;
let cachedConfigSig = '';

function readConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST?.trim();
  const portRaw = process.env.SMTP_PORT?.trim();
  const user = process.env.SMTP_USER?.trim();
  const pass = process.env.SMTP_PASS?.trim();
  const senderEmail = process.env.SMTP_SENDER_EMAIL?.trim();

  if (!host || !portRaw || !user || !pass || !senderEmail) return null;

  const port = Number.parseInt(portRaw, 10);
  if (!Number.isFinite(port) || port <= 0) return null;

  return {
    host,
    port,
    secure: (process.env.SMTP_SECURE?.trim().toLowerCase() ?? '') === 'true' || port === 465,
    user,
    pass,
    senderEmail,
    senderName: process.env.SMTP_SENDER_NAME?.trim() || 'Srilatha Art',
    defaultReplyTo: process.env.SMTP_REPLY_TO?.trim() || senderEmail,
  };
}

function getTransporter(cfg: SmtpConfig): Transporter {
  // Cache the transporter so we reuse SMTP connections across invocations.
  // Bust the cache if any env-var value changes (rotated credentials).
  const sig = `${cfg.host}|${cfg.port}|${cfg.secure}|${cfg.user}`;
  if (cachedTransporter && cachedConfigSig === sig) return cachedTransporter;

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });
  cachedConfigSig = sig;
  return cachedTransporter;
}

export async function sendEmail(input: SendEmailInput): Promise<EmailSendResult> {
  const cfg = readConfig();
  if (!cfg) {
    return {
      ok: false,
      reason: 'not-configured',
      detail: 'SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_SENDER_EMAIL are required',
    };
  }

  try {
    const info = await getTransporter(cfg).sendMail({
      from: `"${cfg.senderName}" <${cfg.senderEmail}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo ?? cfg.defaultReplyTo,
    });
    return { ok: true, messageId: info.messageId };
  } catch (err) {
    // Preserve the SMTP error verbatim so the API can surface it.
    const detail = err instanceof Error ? err.message : String(err);
    console.error('sendEmail failed:', detail);
    return { ok: false, reason: 'smtp-error', detail };
  }
}
