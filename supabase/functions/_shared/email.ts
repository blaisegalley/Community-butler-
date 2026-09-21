export interface Email {
  to: string;
  subject: string;
  heading: string;
  lines: string[];
  /** Optional closing note in smaller, quieter type. */
  footnote?: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/*
 * Neighbours type their own name, address and job details, and all three
 * end up in these emails. Interpolating them into HTML unescaped would let
 * a stray angle bracket — or something worse — into the message.
 */
function render({ heading, lines, footnote }: Email): string {
  const body = lines
    .map((line) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:#3f4642">${escapeHtml(line)}</p>`)
    .join('');
  const note = footnote
    ? `<p style="margin:22px 0 0;font-size:12.5px;line-height:1.5;color:#8a918c">${escapeHtml(footnote)}</p>`
    : '';

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#F4EEE3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid rgba(0,0,0,0.08);border-radius:14px;padding:28px">
    <p style="margin:0 0 18px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#8a918c">Community Butler</p>
    <h1 style="margin:0 0 16px;font-size:21px;line-height:1.25;color:#0B0F0D;font-weight:600">${escapeHtml(heading)}</h1>
    ${body}
    ${note}
  </div>
</body></html>`;
}

/**
 * Sends one email through Resend.
 *
 * Returns false rather than throwing: an email that doesn't go out should
 * not roll back the job status change that triggered it. The caller logs
 * it and carries on.
 */
export async function sendEmail(email: Email): Promise<boolean> {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const from = Deno.env.get('EMAIL_FROM');
  if (!apiKey || !from) {
    console.error('RESEND_API_KEY or EMAIL_FROM is not set — skipping email.');
    return false;
  }
  if (!email.to) return false;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: [email.to],
      subject: email.subject,
      html: render(email),
      text: [email.heading, '', ...email.lines, email.footnote ?? ''].join('\n'),
    }),
  });

  if (!response.ok) {
    console.error('Resend rejected the email:', response.status, await response.text());
    return false;
  }
  return true;
}
