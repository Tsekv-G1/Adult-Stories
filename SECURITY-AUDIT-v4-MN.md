# SECURITY AUDIT — v4 · Adult Stories Mongolia

**Хамрах хүрээ**: 2026-11-04-ний local v3 source, статик аудит болон Netlify handler/R2/FFmpeg аудио тест. Бодит R2/Supabase/Netlify-д нэвтрээгүй. Audit нь live penetration test биш.

## Зассан эрсдэлүүд

| Эрсдэл | Код дахь хамгаалалт | Үлдэгдэл эрсдэл |
|---|---|---|
| Төлбөртэй full MP3 public URL руу дамжих | `server/audio.cjs` paid URL-г private storage reference биш бол буцаахгүй; `member.js` entitlement шалгана; admin paid story-г public URL-аар хадгалахаас хориглоно | Өмнө нь public байсан MP3-ийн **хуучин URL** өөрөө ашиглагдаж байж болно. Origin/CDN дээр устгах/хаах шаардлагатай |
| Төлбөрийн мэдэгдлийг давтаж Telegram flood хийх | `member.js` PATCH зөвхөн `payment_reported_at IS NULL`, owner/status check, 8/15min per-member rate limit | Telegram webhook гадаад орчинд end-to-end шалгаагүй |
| Банкны мэдээлэл кодноос буруу ашиглагдах | Заавал Netlify env payment bank/account/name; IBAN зөвхөн тохируулсан бол харуулна; invoice `memo` хуулах | Operator bank details-г өөрөө шалгана; төлбөр manual approve хэвээр |
| Supabase billing table direct access | Migration `013`: RLS + revoke anon/authenticated on server-only tables, security definer RPC-д зөвхөн service_role execute | Migration ажиллуулаагүй бол одоогийн DB өөрчлөгдөхгүй |
| First-purchase approval RPC алдаа | `013` шинэ `adult_decide_order`: undeclared variable зассан, member-level lock, duplicate receipt/offer check | SQL migration-г live PostgreSQL дээр туршаагүй |
| Arbitrary CTA host fetch / server-side SSRF гадаргуу | CTA-г `*.r2.dev`, `R2_PUBLIC_BASE_URL` эсвэл `CTA_ALLOWED_HOSTS` зөвшөөрсөн host-д хязгаарласан, direct IP/local/signed private URL хориглосон | DNS rebinding/egress level network policy-г эндээс шалгаагүй; production egress хамгаалалт нэмэх нь зөв |
| Clickjacking/transport | Netlify SAMEORIGIN frame policy, HSTS, sensitive browser permissions disabled | CSP-ийн бүрэн бодлого нэмж туршаагүй; Studio iframe same-origin хэвээр |

## Supabase дээр шалгах read-only SQL

```sql
-- Public эсвэл буруу хадгалалт дээр байж болзошгүй төлбөртэй full URL-ууд
select s.id, s.title, p.full_audio_url
from public.stories as s
join public.story_private as p on p.story_id=s.id
where s.price > 0 and p.full_audio_url <> ''
  and p.full_audio_url not like '%r2.cloudflarestorage.com/%'
  and p.full_audio_url not like '%/storage/v1/object/authenticated/adult-audio/%';

-- RLS асаалттай эсэх
select schemaname,tablename,rowsecurity
from pg_tables
where schemaname='public' and tablename in (
  'story_private','adult_members','adult_sessions','adult_payment_orders',
  'adult_entitlements','adult_audio_crop_jobs','adult_first_purchase_redemptions'
);

-- Банкны мэдээлэл байхгүй бол захиалга үүсэхгүйг production staging дээр шалга
-- (энэ нь Supabase SQL биш; Netlify environment + application smoke test).
```

> Энэ query нь **сэжигтэй байж болох URL-ийг** харуулах төдий; `r2.cloudflarestorage.com` гэдэг hostname нь өөрөө private гэдгийн баталгаа биш. Bucket name, R2 public domain, `server/r2.cjs`-ийн private-path validation-ийг давхар баталгаажуулна.

## Заавал гараар шалгах (production)

1. R2_MEDIA_BUCKET public; R2_AUDIO_BUCKET private бөгөөд custom domain, r2.dev public access байхгүй.
2. R2 service token-д зөвхөн шаардлагатай bucket read/write permission, түүнийг браузерт огт оруулахгүй.
3. Алдагдсан, чат эсвэл source-д хуваалцсан bot/API token-уудыг rotate хийх.
4. `SUPABASE_SERVICE_ROLE_KEY` Netlify environment-д л байх, frontend `config.js`-д байхгүй.
5. Зарлагдсан банкны мэдээлэл / IBAN, нэг гүйлгээний memo-г нягтлах; админ баталгаажаагүй байхад entitlement үүсэхгүй байх.
6. 18+ age check нь зөвхөн өөрөө батлах; тухайн бүс нутгийн хууль, нас баталгаажуулалтын шаардлагыг тусад нь шалгах.
7. Утасны дугаарын жинхэнэ эзнийг OTP/verified login-оор баталгаажуулах; одоогийн local login үүнийг хийдэггүй.
8. Одоогийн public full MP3-уудыг private рүү migrate хийж, хуучин public object/CDN линкүүдийг хаах.
