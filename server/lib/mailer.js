// Email delivery for Prism score reports (Phase 6).
//
// Uses nodemailer with plain SMTP credentials from the environment. Like the
// Redis/Sentry integrations, this degrades gracefully: if SMTP isn't configured
// (or nodemailer isn't installed) `isMailEnabled()` returns false and callers
// fall back to the client-side "Download PDF" path instead of failing.
//
// Configuration (server/.env):
//   SMTP_HOST       e.g. smtp.gmail.com
//   SMTP_PORT       e.g. 587 (STARTTLS) or 465 (implicit TLS)
//   SMTP_SECURE     'true' for port 465, otherwise 'false'
//   SMTP_USER       SMTP username / login
//   SMTP_PASS       SMTP password or app-password
//   MAIL_FROM       optional "From" header, defaults to SMTP_USER
//   MAIL_FROM_NAME  optional display name, defaults to "StudAI Prism"

import logger from './logger.js'

let _transport = null
let _loadAttempted = false

export function isMailEnabled() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS)
}

async function getTransport() {
  if (_transport || _loadAttempted) return _transport
  _loadAttempted = true
  if (!isMailEnabled()) return null
  try {
    const nodemailer = (await import('nodemailer')).default
    _transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true' || Number(process.env.SMTP_PORT) === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  } catch (err) {
    logger.captureException(err, { msg: 'mailer_init_failed' })
    _transport = null
  }
  return _transport
}

// Send the score report PDF as an attachment.
//   to        — recipient email
//   pdfBuffer — Node Buffer of the PDF
//   meta      — { name, overall, filename }
// Returns true on success; throws on a hard SMTP failure.
export async function sendReportEmail({ to, pdfBuffer, meta = {} }) {
  const transport = await getTransport()
  if (!transport) throw new Error('mail_not_configured')

  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER
  const fromName = process.env.MAIL_FROM_NAME || 'StudAI Prism'
  const name = meta.name || 'there'
  const overall = typeof meta.overall === 'number' ? meta.overall : null
  const filename = meta.filename || 'Prism-Score-Report.pdf'

  const scoreLine = overall !== null ? `Your Prism Score is <strong>${overall}/100</strong>.` : ''

  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: 'Your Prism Score Report',
    text:
      `Hi ${name},\n\n` +
      `Thanks for completing your Prism AI Skills Assessment. ` +
      `${overall !== null ? `Your Prism Score is ${overall}/100. ` : ''}` +
      `Your full certified report is attached as a PDF.\n\n` +
      `— StudAI Prism`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A2E;line-height:1.6">` +
      `<p>Hi ${name},</p>` +
      `<p>Thanks for completing your <strong>Prism AI Skills Assessment</strong>. ${scoreLine}</p>` +
      `<p>Your full certified report is attached as a PDF.</p>` +
      `<p style="color:#7A7F8C;font-size:13px;margin-top:24px">— StudAI Prism</p>` +
      `</div>`,
    attachments: [{ filename, content: pdfBuffer, contentType: 'application/pdf' }],
  })
  return true
}

// Control Centre Phase 2: admin-triggered report resend. The server does not
// hold a rendered PDF (the PDF is built in the candidate's browser), so this
// sends a secure LINK to the report instead. Recipient is ALWAYS the account
// email on record — callers must never pass an arbitrary address (audit C10).
export async function sendReportLinkEmail({ to, name, reportUrl }) {
  const transport = await getTransport()
  if (!transport) throw new Error('mail_not_configured')

  const fromAddress = process.env.MAIL_FROM || process.env.SMTP_USER
  const fromName = process.env.MAIL_FROM_NAME || 'StudAI Prism'
  const who = name || 'there'

  await transport.sendMail({
    from: `"${fromName}" <${fromAddress}>`,
    to,
    subject: 'Your Prism Score Report',
    text:
      `Hi ${who},\n\n` +
      `As requested, here is the link to view and download your Prism Score Report:\n\n` +
      `${reportUrl}\n\n` +
      `If you did not request this, you can ignore this email.\n\n— StudAI Prism`,
    html:
      `<div style="font-family:Arial,Helvetica,sans-serif;color:#1A1A2E;line-height:1.6">` +
      `<p>Hi ${who},</p>` +
      `<p>As requested, here is the link to view and download your <strong>Prism Score Report</strong>:</p>` +
      `<p><a href="${reportUrl}">${reportUrl}</a></p>` +
      `<p style="color:#7A7F8C;font-size:13px;margin-top:24px">If you did not request this, you can ignore this email.<br/>— StudAI Prism</p>` +
      `</div>`,
  })
  return true
}
