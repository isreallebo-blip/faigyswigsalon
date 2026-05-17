import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface MagicLinkEmailProps {
  siteName: string
  token?: string
}

export const MagicLinkEmail = ({
  siteName,
  token,
}: MagicLinkEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your {siteName} verification code{token ? `: ${token}` : ''}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Your verification code</Heading>
        <Text style={text}>
          Use the 6-digit code below to sign in to {siteName}. This code expires
          in 10 minutes.
        </Text>
        {token ? (
          <Section style={codeBox}>
            <Text style={codeText}>{token}</Text>
          </Section>
        ) : null}
        <Text style={footer}>
          If you didn't request this code, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#000000',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#55575d',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const codeBox = {
  background: '#faf6ef',
  border: '1px solid #e8dcc4',
  borderRadius: '8px',
  padding: '20px',
  textAlign: 'center' as const,
  margin: '0 0 25px',
}
const codeText = {
  fontSize: '34px',
  fontWeight: 'bold' as const,
  letterSpacing: '8px',
  color: '#2a2218',
  margin: '0',
  fontFamily: 'monospace',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
