# Adult Stories Mongolia — v4 (Security + Payment UX + Smart Audio + Premium Player)

## ZIP суулгах тухай

Энэ бол **бүтэн төсөл биш**, 2026-11-04-ний `Adult-Stories-Preview-CTA-Auto-Payment-v3-Patch.zip`-ийг эх төсөл дээр суулгасны дараах **зөвхөн v4-т өөрчилсөн файлуудын patch** юм. ZIP-ийг төслийн root directory-д задалж, ижил замын файлуудыг солино. `tests/`-ийн шинэ болон шинэчлэгдсэн тестүүд багтсан. `node_modules/`, нууц key, бүрэн эх төсөл байхгүй.

**Deploy хийхээс өмнө backup хийнэ үү.** Засваруудын нэг нь төлбөртэй бүтэн аудионы хуучин public URL-ийг автоматаар тоглуулахгүй; хуучин аудио файлуудыг эхлээд private storage-д шилжүүлэх шаардлагатай байж болно.

## 1. Шаардлагатай Netlify environment variables

Дараах гурвыг **заавал** тохируул: `PAYMENT_BANK`, `PAYMENT_ACCOUNT`, `PAYMENT_ACCOUNT_NAME`. Одоо буруу эсвэл хуучин hardcoded банкны мэдээлэл рүү төлбөрийн заавар гаргахгүй. Эдгээрийн аль нэг байхгүй бол сервер шинэ захиалга үүсгэхээс өмнө `payment_not_configured` алдаа өгнө.

Сонголтоор: `PAYMENT_IBAN` (зөв бодит IBAN, тогтмол утга ашиглахгүй), `SUPPORT_CONTACT`.

R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_PUBLIC_BASE_URL`, `R2_MEDIA_BUCKET`, `R2_AUDIO_BUCKET`. `R2_AUDIO_BUCKET` нь нийтэд нээлттэй media bucket-ээс **заавал өөр, private, ямар ч public domain/custom domain холбогдоогүй** байх ёстой. Preview ба CTA л public CDN-ээр гарна.

CTA public URL-г Cloudflare `*.r2.dev` болон `R2_PUBLIC_BASE_URL`-ийн hostname-оос авна. Хэрэв өөр CDN domain ашиглавал `CTA_ALLOWED_HOSTS=cdn.example.mn,media.example.mn` гэж hostname-уудыг таслалаар оруул. `https://`, path, wildcard ашиглахгүй. URL-д token/query/fragment хэрэггүй. Дараа нь Netlify-д redeploy хийнэ.

## 2. Supabase SQL migration

Supabase SQL Editor дээр **өмнөх migration-ууд (ялангуяа `011_first_purchase_offer.sql`, `012_audio_crop_jobs.sql`) суусан эсэхийг шалгаад**, `supabase/013_security_hardening.sql`-ийг ажиллуул. Энэ нь billing хүснэгтүүдийн RLS/grants-ийг баталгаажуулж, төлбөр баталгаажуулах RPC-д байсан SQL зөрчлийг засна. **Бодит Supabase дээр энэ migration-г эндээс ажиллуулаагүй**, SQL-г backup/staging дээр туршина уу.

`SECURITY-AUDIT-v4-MN.md` доторх query-ээр public-д үлдсэн төлбөртэй аудионы URL-уудыг шалга. Хуучин MP3-аа **private R2 audio bucket** эсвэл Supabase authenticated audio storage руу upload хийгээд `story_private.full_audio_url`-ийг шинэ private reference болго. Шилжүүлсний дараа хуучин public файлын URL-ийг CDN/storage дээрээс **устгаж эсвэл public access-г хааж** байж л хуучин link үнэхээр хамгаалагдана.

## 3. Энэ update-ээр өөрчлөгдсөн зүйлс

**Security**: Paid story-д сервер эрхийн шалгалтаас гадна full audio reference-г private эсэхээр шалгана. Public URL байвал хэрэглэгчид шууд өгөхгүй, migration шаардлагатайг тэмдэглэнэ. Admin paid story-г public full URL-аар нийтлэхээс сэрэмжлүүлнэ. R2 private/media bucket тусдаа хэвээр. Payment report зөвхөн нэг удаа өөрчлөгдөж, Telegram мэдэгдэл давхар үүсэхгүй; rate limiting-тай. Same-origin iframe, HTTPS HSTS болон device permissions headers нэмэгдсэн.

**Payment UX**: Bank name/account/name зөвхөн серверийн тохиргооноос; IBAN тохируулсан үед л харагдана. Банкны гүйлгээний утга (`order.memo`) заавал харуулах, нэг товшоод хуулах. Эрхийн сонголт руу буцах; захиалгын алдааны дараа дахин оролдох. Хэрэглэгчийн эрхийг зөвхөн **админ баталгаажуулсан дараа** олгоно. Бүртгэлгүй зочинд preview/CTA-гийн дараа эрхийн сонголт харагдах v3 урсгал хэвээр.

**Smart Audio**: Шинээр бэлтгэсэн preview болон CTA-г нэг MP3 болгохдоо тус бүрт -18 LUFS target, -1.5 dB true peak limit (`loudnorm`) туршиж, CTA-ийн эхлэл ба төгсгөлд богино fade хийнэ. 1–2 секундийн бодит чимээгүй завсар хэвээр. Өмнө нь бэлтгэсэн preview-д шинэ processing автоматаар хэрэгжихгүй: Editor дотор **PREVIEW БЭЛДЭХ**-ийг дахин дарж шинэчилнэ.

**Premium Player**: Унтах таймер 5, 10, 15, 30, 45, 60 минут; browser background-аас эргэн ирэхэд дууссан эсэхийг нягтална. Үлдсэн минутыг харуулна. Дууссан аудио дахин эхнээсээ тоглоно; буруу/хэтэрхий төгсгөлд хадгалсан position-ийг сэргээхгүй. Home-ийн Continue Listening дээр preview-д нэг дарж зогссон газраас үргэлжлүүлэх боломжтой. Бүтэн аудио дээр эрхийн шалгалт, reader flow хэвээр.

## 4. Шалгах дараалал

```bash
npm ci
npm test
npm run build
```

Локал орчинд `@aws-sdk/*` dependencies суулгагдаагүй байсан тул **нэг AWS integration test алгасагдсан**. Бусад тест ба static build давсан. Энэ ZIP-д package.json/package-lock өөрчлөгдөөгүй; full project дээр `npm ci` суулгана. Хөгжүүлэлтийн орчинд локал FFmpeg ашигласан; Netlify-ийн FFmpeg/background execution дээр **бодит preview/CTA E2E туршилт хийгдээгүй**.

**Deploy-ийн дараах manual smoke**: 18+ зочин preview+CTA сонсож дуусгаад membership сонголт харж байна уу; sign-in дараа зөв сонголт хадгалагдаж байна уу; банкны данс/IBAN/гүйлгээний утга зөв үү; payment report-ийг хоёр дарсан ч Telegram notification нэг үү; админ төлбөр батлахад private full audio нээгдэж байна уу; хугацаа нь дууссан эрхээр бүтэн аудио тоглохгүй байна уу; гар утас дээр sleep timer ба Continue Listening ажиллаж байна уу.

## 5. Хязгаарлалт / operator action

- **Live penetration test, Supabase schema deployment, Netlify environment, real bank settlement, R2 access policy** эндээс баталгаажаагүй. Энэ бол source-code audit + regression tests юм.
- Public-д **аль хэдийн байршуулсан хуучин бүтэн MP3**-ийн холбоосыг серверийн код ганцаараа хүчингүй болгож чадахгүй; origin/CDN дээр private болгох, хуучныг устгах/хаах хэрэгтэй.
- Банкны шилжүүлэг **автоматаар банкнаас баталгаажаагүй**: өмнөх шиг админы гар баталгаажуулалт хэвээр.
- Утасны дугаарын эзэмшигчийг SMS OTP-оор баталгаажуулах механизм одоогоор байхгүй; үүнийг тусдаа үйлчилгээ ашиглан хэрэгжүүлэх шаардлагатай.
- 18+ нь self-declaration; бодит нас баталгаажуулалт биш.
