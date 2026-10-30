# ADULT Stories — GitHub / Netlify V6.2

Энэ багц нь GitHub repository-д оруулж, Netlify дээр нийтлэх зориулалттай.

## GitHub → Netlify

1. ZIP-ээ задална.
2. Хавтасны доторх `public/`, `supabase/`, `netlify.toml`, README болон `.gitignore`-ийг repository-ийн ҮНДСЭН түвшинд оруулна. ZIP-ийг өөрийг нь байрлуулахгүй.
3. Netlify дээр repository-оо холбоно.
4. Base directory: хоосон; Build command: хоосон; Publish directory: `public`. `netlify.toml` үүнийг тохируулсан.
5. Deploy хийнэ.

Сайт: `https://ТАНЫ-САЙТ.netlify.app/`
Админ: `https://ТАНЫ-САЙТ.netlify.app/admin.html`

`public/` доторх файлууд л Netlify сайтаар нийтлэгдэнэ. SQL болон optional Edge Function нь public хавтасны гадна байна. Python desktop launcher, хувийн контентын JSON, backup, тестийн fixture энэ багцад ороогүй.

## Supabase

`public/config.js` нь хэрэглэгчийн өгсөн төслийн URL болон publishable key-тай. Cloudinary: `m3qbt9bk`, unsigned preset: `Adult_Story`.

- ШИНЭ Supabase төсөл бол `supabase/schema.sql`-ийг SQL Editor дээр анх удаа ажиллуулна. Өмнө суулгасан schema-г дахин бүтнээр нь ажиллуулах шаардлагагүй.
- Админ email/password аккаунтыг Authentication → Users дээр үүсгээд тэр хэрэглэгчийн UUID-г `admin_users` хүснэгтэд schema-ийн төгсгөлийн заавраар нэмнэ. Энгийн дугаарын бүртгэл админ эрх авахгүй.
- Дугаар + нууц үгийн SMS-гүй бүртгэл: Authentication → Sign In / Providers → Phone → Enable ON, Confirm phone OFF; шинэ signup зөвшөөрсөн байна. Код нь эдгээр тохиргоог шалгасны дараа signup хүсэлт явуулна. Дугаарын эзэмшлийг баталгаажуулахгүй.
- Нууц үг сэргээх SMS урсгал болон production төлбөрийн эрх энэ багцад хэрэгжээгүй.
- Cloudinary signed upload хэрэглэх бол `supabase/functions/sign-cloudinary`-г Supabase-д тусад нь deploy хийнэ. Netlify энэ function-ийг deploy хийхгүй. Одоогийн тохиргоо unsigned upload ашигладаг.

Supabase phone/password баримт: https://supabase.com/docs/guides/auth/passwords#with-phone

## Өмнөх локал контент

GitHub-д код оруулахад компьютерийн локал контент автоматаар шилжихгүй. Өмнөх desktop багцын админаас бүтэн JSON BACKUP авч, онлайн админы Backup / Import хэсэгт импортлоно. Хувийн өгүүллэгийн backup JSON-оо GitHub-д оруулахгүй. Нүүр хуудасны дизайн шилжүүлэх checkbox-ийг хэрэгтэй бол сонгоно.

## Локал харах

`public` хавтас дотор Terminal нээгээд `python3 -m http.server 8000` ажиллуулна. Дараа нь `http://localhost:8000/index.html` эсвэл `/admin.html` нээнэ. Энэ нь тохируулсан Supabase-г ашиглах статик preview; хуучин desktop файлын санг сэргээхэд өмнөх бүтэн V6.2 багцаа ашиглана.

## Баталгаажуулалт

V6.2-ийн синтакс болон mock логикийн шалгалтууд өмнө давсан. Шинэ UI-ийн бодит desktop/mobile browser ажиллагаа, Supabase бүртгэл, жинхэнэ Cloudinary upload, GitHub/Netlify deployment-ийг live баталгаажуулаагүй. Энэ багц үүсгэхэд ямар нэг сайт нийтлээгүй, бодит өгөгдөл шилжүүлээгүй, Supabase Dashboard-ийн тохиргоо өөрчлөөгүй.
