import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/twilio-test')({
  server: {
    handlers: {
      GET: async () => {
        const sid = process.env.TWILIO_ACCOUNT_SID;
        const token = process.env.TWILIO_AUTH_TOKEN;
        const from = process.env.TWILIO_FROM_NUMBER;
        if (!sid || !token || !from) {
          return Response.json({ ok: false, error: 'missing env', has: { sid: !!sid, token: !!token, from: !!from } }, { status: 500 });
        }
        const auth = 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64');
        const acctRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, { headers: { Authorization: auth } });
        const acct = await acctRes.json().catch(() => ({}));
        if (!acctRes.ok) return Response.json({ ok: false, step: 'account', status: acctRes.status, body: acct }, { status: 500 });
        const numRes = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(from)}`, { headers: { Authorization: auth } });
        const num = await numRes.json().catch(() => ({}));
        const owned = Array.isArray(num.incoming_phone_numbers) && num.incoming_phone_numbers.length > 0;
        return Response.json({
          ok: acct.status === 'active' && owned,
          account: { friendly_name: acct.friendly_name, status: acct.status, type: acct.type },
          from,
          from_owned: owned,
        });
      },
    },
  },
});
