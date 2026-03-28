import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json({ limit: '1mb' }));

const PORT = Number(process.env.PORT || 3000);
const LOG_ONLY = String(process.env.LOG_ONLY || 'false').toLowerCase() === 'true';
const ENABLE_META_WHATSAPP = String(process.env.ENABLE_META_WHATSAPP || 'true').toLowerCase() === 'true';
const ENABLE_TWILIO_SMS = String(process.env.ENABLE_TWILIO_SMS || 'true').toLowerCase() === 'true';
const DEFAULT_SENDER_NAME = process.env.DEFAULT_SENDER_NAME || 'بنك الرياضيات';

function normalizePhone(phone) {
  let s = String(phone || '').trim().replace(/\s+/g, '');
  if (!s) return '';
  if (s.startsWith('+')) return s;
  if (s.startsWith('00')) return '+' + s.slice(2);
  if (s.startsWith('966')) return '+' + s;
  if (s.startsWith('05')) return '+966' + s.slice(1);
  return s;
}

function toMetaPhone(phone) {
  return normalizePhone(phone).replace(/^\+/, '');
}

function pickRecipient(payload, channel) {
  if (channel === 'sms') {
    return normalizePhone(payload.guardianSms || payload.guardianWhats || '');
  }
  return normalizePhone(payload.guardianWhats || payload.guardianSms || '');
}

function buildFallbackMessage(payload, senderName) {
  const txTypeMap = {
    deposit: 'إيداع',
    withdraw: 'سحب',
    transfer: 'تحويل'
  };
  const txType = txTypeMap[String(payload.type || '').toLowerCase()] || (payload.type || 'عملية');
  const student = String(payload.studentName || payload.name || 'الطالب/ـة').trim();
  const amount = Number(payload.amount || 0);
  const balanceAfter = Number(payload.balanceAfter || 0);
  const reason = String(payload.reason || '—').trim();

  return [
    'السلام عليكم ورحمة الله وبركاته',
    `نحيطكم علمًا بأنه تم تسجيل ${txType} للطالب/ـة: ${student}`,
    `المبلغ: ${Number.isFinite(amount) ? amount : 0}`,
    `السبب: ${reason}`,
    `الرصيد بعد العملية: ${Number.isFinite(balanceAfter) ? balanceAfter : 0}`,
    `مع التحية، ${senderName || DEFAULT_SENDER_NAME}`
  ].join('\n');
}

async function sendMetaWhatsApp({ to, body, payload }) {
  const phoneNumberId = process.env.META_WA_PHONE_NUMBER_ID;
  const accessToken = process.env.META_WA_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    throw new Error('META_CONFIG_MISSING');
  }

  const templateName = process.env.META_WA_TEMPLATE_NAME;
  const templateLang = process.env.META_WA_TEMPLATE_LANG || 'ar';
  const url = `https://graph.facebook.com/v23.0/${phoneNumberId}/messages`;

  let reqBody;
  if (templateName) {
    reqBody = {
      messaging_product: 'whatsapp',
      to: toMetaPhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: templateLang },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: String(payload.studentName || payload.name || 'الطالب/ـة') },
              { type: 'text', text: String(payload.type || 'عملية') },
              { type: 'text', text: String(payload.amount || 0) },
              { type: 'text', text: String(payload.reason || '—') },
              { type: 'text', text: String(payload.balanceAfter || 0) }
            ]
          }
        ]
      }
    };
  } else {
    reqBody = {
      messaging_product: 'whatsapp',
      to: toMetaPhone(to),
      type: 'text',
      text: {
        preview_url: false,
        body
      }
    };
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`
    },
    body: JSON.stringify(reqBody)
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`META_SEND_FAILED:${res.status}:${JSON.stringify(data)}`);
  }
  return data;
}

async function sendTwilioSms({ to, body }) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) {
    throw new Error('TWILIO_CONFIG_MISSING');
  }

  const auth = Buffer.from(`${sid}:${token}`).toString('base64');
  const form = new URLSearchParams();
  form.set('To', to);
  form.set('From', from);
  form.set('Body', body);

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: form.toString()
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`TWILIO_SEND_FAILED:${res.status}:${JSON.stringify(data)}`);
  }
  return data;
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'math-bank-webhook' });
});

app.post('/send', async (req, res) => {
  const root = req.body || {};
  const payload = root.payload || root;
  const settings = root.settings || {};
  const senderName = settings.senderName || DEFAULT_SENDER_NAME;

  if (!payload || payload.autoNotify === false) {
    return res.status(200).json({ ok: true, skipped: true, reason: 'AUTO_NOTIFY_DISABLED' });
  }

  const channel = String(payload.notifyChannel || 'whatsapp');
  const body = buildFallbackMessage(payload, senderName);
  const result = {
    ok: true,
    channel,
    logOnly: LOG_ONLY,
    attempts: []
  };

  try {
    if (LOG_ONLY) {
      result.preview = { body, payload };
      return res.status(200).json(result);
    }

    if ((channel === 'whatsapp' || channel === 'both') && ENABLE_META_WHATSAPP) {
      const to = pickRecipient(payload, 'whatsapp');
      if (to) {
        const meta = await sendMetaWhatsApp({ to, body, payload });
        result.attempts.push({ provider: 'meta_whatsapp', to, success: true, response: meta });
      } else {
        result.attempts.push({ provider: 'meta_whatsapp', success: false, error: 'NO_WHATSAPP_NUMBER' });
      }
    }

    if ((channel === 'sms' || channel === 'both') && ENABLE_TWILIO_SMS) {
      const to = pickRecipient(payload, 'sms');
      if (to) {
        const sms = await sendTwilioSms({ to, body });
        result.attempts.push({ provider: 'twilio_sms', to, success: true, responseSid: sms.sid || null, status: sms.status || null });
      } else {
        result.attempts.push({ provider: 'twilio_sms', success: false, error: 'NO_SMS_NUMBER' });
      }
    }

    if (!result.attempts.length) {
      return res.status(400).json({ ok: false, error: 'NO_PROVIDER_ENABLED_OR_NO_TARGET' });
    }

    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error instanceof Error ? error.message : 'UNKNOWN_ERROR'
    });
  }
});

app.listen(PORT, () => {
  console.log(`Math Bank Webhook listening on http://localhost:${PORT}`);
});
