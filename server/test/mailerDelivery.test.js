// PROD-READY Phase 1: end-to-end delivery tests for lib/mailer.js.
//
// nodemailer moved from 9.x to 10.x (advisories GHSA-6vj9-mwq6-2f5v,
// GHSA-8vvx-rff5-p5rq, GHSA-g57g-f23g-4646, GHSA-v53p-9fqp-m79j,
// GHSA-prgh-xp8r-p3m5). 10.0.0 is a TypeScript rewrite with new ESM/CJS
// builds, so these tests drive the REAL nodemailer transport against a tiny
// in-process SMTP server on 127.0.0.1 and assert what actually goes over the
// wire for the report email (attachment), the report-link email and the
// campus invite / assignment emails. No message leaves the machine.

import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'

const messages = []

// Minimal SMTP server: EHLO (AUTH, no STARTTLS) → AUTH → MAIL → RCPT → DATA.
const server = net.createServer((socket) => {
  socket.setEncoding('latin1')
  let buffer = ''
  let inData = false
  let current = null
  const reply = (line) => socket.write(`${line}\r\n`)
  reply('220 prism-test-smtp ESMTP')
  socket.on('data', (chunk) => {
    buffer += chunk
    for (;;) {
      if (inData) {
        const end = buffer.indexOf('\r\n.\r\n')
        if (end === -1) return
        current.raw = buffer.slice(0, end).replace(/\r\n\.\./g, '\r\n.')
        buffer = buffer.slice(end + 5)
        messages.push(current)
        current = null
        inData = false
        reply('250 2.0.0 queued')
        continue
      }
      const nl = buffer.indexOf('\r\n')
      if (nl === -1) return
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 2)
      const verb = line.split(' ')[0].toUpperCase()
      if (verb === 'EHLO') {
        socket.write('250-prism-test-smtp\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n')
      } else if (verb === 'HELO') {
        reply('250 prism-test-smtp')
      } else if (verb === 'AUTH') {
        const [, mech, initial] = line.split(' ')
        assert.equal(mech.toUpperCase(), 'PLAIN', 'mailer authenticates with AUTH PLAIN')
        const decoded = Buffer.from(initial || '', 'base64').toString('utf8').split('\0')
        assert.deepEqual(decoded.slice(1), ['mailer-user', 'mailer-pass'], 'SMTP credentials come from the environment')
        reply('235 2.7.0 authenticated')
      } else if (verb === 'MAIL') {
        current = { from: line, rcpt: [] }
        reply('250 2.1.0 ok')
      } else if (verb === 'RCPT') {
        current.rcpt.push(line)
        reply('250 2.1.5 ok')
      } else if (verb === 'DATA') {
        inData = true
        reply('354 end with <CRLF>.<CRLF>')
      } else if (verb === 'RSET' || verb === 'NOOP') {
        reply('250 ok')
      } else if (verb === 'QUIT') {
        reply('221 bye')
        socket.end()
        return
      } else {
        reply('502 not implemented')
      }
    }
  })
  socket.on('error', () => {})
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))

process.env.SMTP_HOST = '127.0.0.1'
process.env.SMTP_PORT = String(server.address().port)
process.env.SMTP_SECURE = 'false'
process.env.SMTP_USER = 'mailer-user'
process.env.SMTP_PASS = 'mailer-pass'
process.env.MAIL_FROM = 'reports@prism.test'
process.env.MAIL_FROM_NAME = 'StudAI Prism'

const mailer = await import('../lib/mailer.js')
const { PILOT_NOTICE, NOT_SOLE_BASIS_POLICY } = await import('../lib/sharedConstants.js')

test.after(() => new Promise((resolve) => server.close(resolve)))

// Decode quoted-printable soft breaks and escapes so body text can be asserted.
const decodeQp = (raw) =>
  Buffer.from(
    raw.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16))),
    'latin1',
  ).toString('utf8')

const headerValue = (raw, name) => {
  const head = raw.split('\r\n\r\n')[0].replace(/\r\n[ \t]+/g, ' ')
  const match = head.split('\r\n').find((l) => l.toLowerCase().startsWith(`${name.toLowerCase()}:`))
  return match ? match.slice(name.length + 1).trim() : null
}

const lastMessage = () => messages[messages.length - 1]

test('mailer is enabled from SMTP environment variables', () => {
  assert.equal(mailer.isMailEnabled(), true)
})

test('report email: delivered via SMTP with the PDF attached, the pilot notice and no composite', async () => {
  const before = messages.length
  const pdf = Buffer.from('%PDF-1.4 prism test report body\n%%EOF')
  const ok = await mailer.sendReportEmail({
    to: 'candidate@example.com',
    pdfBuffer: pdf,
    meta: { name: 'Asha', filename: 'Prism-Report-Asha.pdf' },
  })
  assert.equal(ok, true)
  assert.equal(messages.length, before + 1)
  const msg = lastMessage()
  assert.match(msg.from, /<reports@prism\.test>/)
  assert.deepEqual(msg.rcpt.map((r) => r.match(/<([^>]+)>/)[1]), ['candidate@example.com'])
  assert.equal(headerValue(msg.raw, 'Subject'), 'Your Prism Report')
  assert.match(headerValue(msg.raw, 'From'), /^"?StudAI Prism"? <reports@prism\.test>$/)
  assert.match(headerValue(msg.raw, 'Content-Type'), /^multipart\/mixed/)

  const body = decodeQp(msg.raw)
  assert.ok(body.includes('Hi Asha,'))
  assert.ok(body.includes(PILOT_NOTICE), 'report email carries the pilot notice')
  assert.ok(body.includes(NOT_SOLE_BASIS_POLICY), 'report email carries the not-sole-basis policy')
  assert.ok(!/certified/i.test(body), 'no "certified" claim')
  assert.ok(!/overall|composite/i.test(body), 'no composite score in a report email')

  // The attachment survives the MIME round trip byte for byte.
  const attachment = msg.raw.match(
    /Content-Type: application\/pdf; name=([^\r\n]+)\r\n(?:[^\r\n]+\r\n)*?\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/,
  )
  assert.ok(attachment, 'a PDF attachment part is present')
  assert.match(attachment[1], /Prism-Report-Asha\.pdf/)
  assert.ok(/Content-Disposition: attachment; filename=Prism-Report-Asha\.pdf/.test(msg.raw))
  assert.deepEqual(Buffer.from(attachment[2].replace(/\r\n/g, ''), 'base64'), pdf)
})

test('report-link email: delivered with the link and the policy notices', async () => {
  const before = messages.length
  const url = 'https://prism.test/report/abc123?token=t0k'
  await mailer.sendReportLinkEmail({ to: 'owner@example.com', name: 'Ravi', reportUrl: url })
  assert.equal(messages.length, before + 1)
  const msg = lastMessage()
  assert.deepEqual(msg.rcpt.map((r) => r.match(/<([^>]+)>/)[1]), ['owner@example.com'])
  const body = decodeQp(msg.raw)
  assert.ok(body.includes(url))
  assert.ok(body.includes(PILOT_NOTICE))
  assert.ok(body.includes(NOT_SOLE_BASIS_POLICY))
  assert.ok(!/content-type: application\/pdf/i.test(msg.raw), 'link email has no attachment')
})

test('campus invite email: institution text is escaped in HTML and stripped of line breaks in the subject', async () => {
  const before = messages.length
  const inviteUrl = 'https://prism.test/invite/accept?token=one-time&x=1'
  await mailer.sendOrgInviteEmail({
    to: 'student@example.edu',
    organizationName: 'Riverside <b>College</b> & Co\r\nBcc: attacker@evil.example',
    inviteUrl,
  })
  assert.equal(messages.length, before + 1)
  const msg = lastMessage()
  assert.deepEqual(msg.rcpt.map((r) => r.match(/<([^>]+)>/)[1]), ['student@example.edu'], 'no injected recipient')
  const subject = headerValue(msg.raw, 'Subject')
  assert.ok(!/\r|\n/.test(subject))
  assert.ok(!/^Bcc:/im.test(msg.raw.split('\r\n\r\n')[0]), 'no injected Bcc header')
  const body = decodeQp(msg.raw)
  assert.ok(body.includes('&lt;b&gt;College&lt;/b&gt; &amp; Co'), 'organization name is HTML-escaped')
  assert.ok(!body.includes('<strong>Riverside <b>'), 'raw institution markup never reaches the HTML part')
  assert.ok(body.includes('https://prism.test/invite/accept?token=one-time&amp;x=1'), 'invite URL is escaped in HTML')
  assert.ok(body.includes(inviteUrl), 'invite URL is present verbatim in the text part')
  assert.ok(body.includes('Your personal Prism results stay private unless you choose to share them.'))
})

test('campus assignment email: delivered with escaped title and due date', async () => {
  const before = messages.length
  await mailer.sendCampusAssignmentEmail({
    to: 'student@example.edu',
    organizationName: 'Riverside College',
    assessmentTitle: 'Team <script>x</script> brief',
    dueAt: '2026-11-01T10:00:00.000Z',
    url: 'https://prism.test/campus/assignments/a1',
  })
  assert.equal(messages.length, before + 1)
  const msg = lastMessage()
  assert.equal(headerValue(msg.raw, 'Subject'), 'Riverside College assigned you a Prism assessment')
  const body = decodeQp(msg.raw)
  assert.ok(body.includes('Team &lt;script&gt;x&lt;/script&gt; brief'))
  assert.ok(!body.includes('<script>x</script></strong>'))
  assert.ok(body.includes('Sun, 01 Nov 2026 10:00:00 GMT'))
})

test('campus assignment reminder email (PROD-READY Phase 5): escaped title, due date, no student name', async () => {
  const before = messages.length
  await mailer.sendCampusAssignmentReminderEmail({
    to: 'student@example.edu',
    organizationName: 'Riverside <b>College</b>',
    assessmentTitle: 'Team <script>x</script> brief',
    dueAt: '2026-11-01T10:00:00.000Z',
    url: 'https://prism.test/campus/assignments',
  })
  assert.equal(messages.length, before + 1)
  const msg = lastMessage()
  assert.match(headerValue(msg.raw, 'Subject'), /Reminder/, 'subject names a reminder (MIME-encoded when it carries quotes)')
  const body = decodeQp(msg.raw)
  assert.ok(body.includes('Team &lt;script&gt;x&lt;/script&gt; brief'))
  assert.ok(body.includes('Riverside &lt;b&gt;College&lt;/b&gt;'))
  assert.ok(!body.includes('<script>x</script></strong>'))
  assert.ok(body.includes('Sun, 01 Nov 2026 10:00:00 GMT'))
  assert.ok(body.includes('If you have already finished, you can ignore this message.'))
})

test('an SMTP rejection surfaces as an error to the caller', async () => {
  // No usable recipient: nodemailer refuses the envelope and the mailer
  // propagates the failure (callers log it and fall back; nothing is swallowed).
  await assert.rejects(() => mailer.sendOrgInviteEmail({ to: '', organizationName: 'X', inviteUrl: 'https://prism.test/i' }))
})
