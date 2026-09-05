import "server-only"

import { Resend } from "resend"

export function emailEnabled(): boolean {
  return process.env.EMAIL_ENABLED?.toLowerCase() === "true"
}

function emailClient() {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM_EMAIL
  if (!apiKey || !from) throw new Error("email_not_configured")
  return { client: new Resend(apiKey), from }
}

export async function sendAccountEmail(input: {
  to: string
  subject: string
  heading: string
  body: string
  actionLabel: string
  actionUrl: string
}) {
  if (!emailEnabled()) return { skipped: true as const }
  const { client, from } = emailClient()
  const { error } = await client.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#333;line-height:1.5"><h1 style="color:#EF4C7F">${escapeHtml(input.heading)}</h1><p>${escapeHtml(input.body)}</p><p><a href="${escapeHtml(input.actionUrl)}" style="display:inline-block;background:#EF4C7F;color:white;padding:12px 18px;text-decoration:none">${escapeHtml(input.actionLabel)}</a></p><p style="font-size:12px;color:#777;word-break:break-all">${escapeHtml(input.actionUrl)}</p></body></html>`,
  })
  if (error) throw new Error(`email_send_failed:${error.message}`)
  return { skipped: false as const }
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[character]!)
}
