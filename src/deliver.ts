import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import nodemailer from "nodemailer";

export interface MailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
}

export interface Message {
  subject: string;
  text: string;
  html?: string;
  attachments?: { filename: string; content: string }[];
}

/** Reads SMTP settings from the environment, or returns undefined if they aren't all set. */
export function mailConfigFromEnv(env: NodeJS.ProcessEnv = process.env): MailConfig | undefined {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, REPORT_TO, REPORT_FROM } = env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS || !REPORT_TO) return undefined;
  return {
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 465),
    user: SMTP_USER,
    pass: SMTP_PASS,
    from: REPORT_FROM || SMTP_USER,
    to: REPORT_TO,
  };
}

export async function sendEmail(config: MailConfig, message: Message): Promise<void> {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });
  await transport.sendMail({ from: config.from, to: config.to, ...message });
}

/** Local fallback when email isn't configured: writes the report into ./reports. */
export async function writeLocal(dir: string, baseName: string, message: Message): Promise<string[]> {
  await mkdir(dir, { recursive: true });
  const written: string[] = [];
  const put = async (name: string, content: string) => {
    const path = join(dir, name);
    await writeFile(path, content);
    written.push(path);
  };
  await put(`${baseName}.txt`, message.text);
  if (message.html) await put(`${baseName}.html`, message.html);
  for (const a of message.attachments ?? []) await put(a.filename, a.content);
  return written;
}
