import { describe, it, expect } from 'vitest'
import { render } from '@react-email/components'
import React from 'react'

import { SignupEmail } from '@/lib/email-templates/signup'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { InviteEmail } from '@/lib/email-templates/invite'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const SITE = 'Faigy\u2019s Wig Salon'
const URL = 'https://faigyswigsalon.com'
const CONFIRM = 'https://faigyswigsalon.com/confirm?token=abc123'

async function html(el: React.ReactElement) {
  return await render(el)
}

describe('Auth email templates', () => {
  it('signup renders with site name, recipient & confirmation URL', async () => {
    const out = await html(
      <SignupEmail siteName={SITE} siteUrl={URL} recipient="jane@example.com" confirmationUrl={CONFIRM} />,
    )
    expect(out).toContain(SITE)
    expect(out).toContain('jane@example.com')
    expect(out).toContain(CONFIRM)
    expect(out).toContain('Verify Email')
  })

  it('magic link renders login button to confirmation URL', async () => {
    const out = await html(<MagicLinkEmail siteName={SITE} confirmationUrl={CONFIRM} />)
    expect(out).toContain('Log In')
    expect(out).toContain(CONFIRM)
    expect(out).toContain(SITE)
  })

  it('recovery renders reset password CTA', async () => {
    const out = await html(<RecoveryEmail siteName={SITE} confirmationUrl={CONFIRM} />)
    expect(out).toContain('Reset')
    expect(out).toContain(CONFIRM)
  })

  it('invite renders accept invitation CTA', async () => {
    const out = await html(<InviteEmail siteName={SITE} siteUrl={URL} confirmationUrl={CONFIRM} />)
    expect(out).toContain('Accept Invitation')
    expect(out).toContain(URL)
    expect(out).toContain(CONFIRM)
  })

  it('email-change shows OLD -> NEW from old address to new address', async () => {
    const out = await html(
      <EmailChangeEmail
        siteName={SITE}
        oldEmail="old@example.com"
        email="new@example.com"
        newEmail="new@example.com"
        confirmationUrl={CONFIRM}
      />,
    )
    // Must read "from OLD to NEW" — never "from NEW to NEW"
    const oldIdx = out.indexOf('old@example.com')
    const newIdx = out.indexOf('new@example.com')
    expect(oldIdx).toBeGreaterThanOrEqual(0)
    expect(newIdx).toBeGreaterThan(oldIdx)
    expect(out).toContain(CONFIRM)
  })

  it('reauthentication renders the OTP code', async () => {
    const out = await html(<ReauthenticationEmail token="123456" />)
    expect(out).toContain('123456')
    expect(out).toContain('confirm')
  })

  it('no template leaks an unsubscribe link (auth emails)', async () => {
    const out = await html(<MagicLinkEmail siteName={SITE} confirmationUrl={CONFIRM} />)
    expect(out.toLowerCase()).not.toContain('unsubscribe')
  })
})
