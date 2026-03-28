# Webhook جاهز لبنك الرياضيات

هذا الملف يستقبل الطلب القادم من **بنك الرياضيات** عند تسجيل العملية، ثم يرسل الإشعار إلى ولي الأمر.

## ماذا يفعل؟
- يستقبل `POST /send`
- يقرأ بيانات العملية القادمة من بنك الرياضيات
- يرسل:
  - **واتساب** عبر **Meta WhatsApp Cloud API**
  - **SMS** عبر **Twilio SMS API**
- يدعم القنوات التالية:
  - `whatsapp`
  - `sms`
  - `both`

## قبل التشغيل
1. ثبتي Node.js 18 أو أحدث.
2. افتحي المجلد.
3. ثبتي الحزم:
   ```bash
   npm install
   ```
4. انسخي `.env.example` إلى `.env`
5. عبئي بيانات مزود الإرسال.

## التشغيل
```bash
npm start
```

بعد التشغيل سيكون الرابط المحلي:
```text
http://localhost:3000/send
```

## ربطه داخل بنك الرياضيات
في **إعدادات الإشعارات** داخل بنك الرياضيات:
- اختاري: `Webhook / API خارجي`
- ضعي الرابط:
  - محليًا للتجربة: `http://localhost:3000/send`
  - أو رابط الاستضافة بعد رفعه على Render / Railway / VPS

## وضع التجربة بدون إرسال حقيقي
ضعي في `.env`:
```env
LOG_ONLY=true
```
وسيكتفي الخادم بعرض المعاينة بدل الإرسال الفعلي.

## متغيرات البيئة
### واتساب الرسمي من Meta
- `META_WA_PHONE_NUMBER_ID`
- `META_WA_ACCESS_TOKEN`
- `META_WA_TEMPLATE_NAME` اختياري
- `META_WA_TEMPLATE_LANG` مثل `ar`

### SMS من Twilio
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_SMS_FROM`

## مهم جدًا
إذا كنت سترسلين **رسائل واتساب استباقية** مثل إشعار إيداع أو غياب، فغالبًا تحتاجين **قالب رسالة معتمد** في واتساب. Meta توضح أن Cloud API يستخدم Bearer access token لإرسال الرسائل، وتوفر مرجع Message API لذلك. citeturn382411search0turn382411search6

وبالنسبة للرسائل النصية، Twilio يوضح أن إرسال SMS يتم عبر **POST** إلى Message resource في REST API. citeturn382411search1turn382411search10

## شكل البيانات التي يستقبلها
الخادم متوافق مع الشكل القادم من بنك الرياضيات الحالي:
```json
{
  "source": "math-bank",
  "settings": {
    "mode": "webhook",
    "endpoint": "https://example.com/send",
    "senderName": "بنك الرياضيات",
    "fallbackToApp": true
  },
  "payload": {
    "studentName": "محمد",
    "type": "deposit",
    "amount": 10,
    "reason": "مشاركة مميزة",
    "balanceAfter": 120,
    "guardianWhats": "+9665xxxxxxx",
    "guardianSms": "+9665xxxxxxx",
    "notifyChannel": "both",
    "autoNotify": true
  }
}
```

## ملاحظات عملية
- إذا أردتِ واتساب فقط: عطلي SMS في `.env`.
- إذا أردتِ SMS فقط: عطلي Meta WhatsApp في `.env`.
- إذا أردتِ العمل فورًا قبل ربط المزود، فعّلي `LOG_ONLY=true` للتجربة.


## نشر سريع على Render
1. ارفعي هذا المجلد إلى GitHub.
2. من Render اختاري **New +** ثم **Blueprint** أو **Web Service**.
3. إذا استخدمتِ Blueprint فسيقرأ Render ملف `render.yaml` تلقائيًا.
4. أضيفي متغيرات البيئة من ملف `.env.example` داخل لوحة Render.
5. بعد النشر خذي الرابط النهائي مثل:
   `https://math-bank-webhook.onrender.com/send`
6. ضعي هذا الرابط داخل **إعدادات الإشعارات** في بنك الرياضيات.

### للتجربة أولًا
اجعلي:
```env
LOG_ONLY=true
```
ثم جرّبي من بنك الرياضيات. إذا ظهر الطلب في سجلات Render فمعناه الربط ناجح.

### للتشغيل الفعلي
- فعّلي واتساب أو SMS حسب مزودك.
- غيّري:
```env
LOG_ONLY=false
```
