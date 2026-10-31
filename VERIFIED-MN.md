# Шалгалтын тайлан · 2026-10-31

## Тэнцсэн

- Adult Stories: 18 функциональ шалгалт. Бүртгэл/нэвтрэлт, сcrypt hash, cookie, төлөөгүй үед хувийн агуулга хаалттай байх, серверийн үнэ, төлбөр мэдэгдэх, банкны баталгаа, давхар батлахаас хамгаалах, эрх, орлогын тайлан, төхөөрөмж хоорондын сан/явц, ноорог RLS, нууц үг сэргээх/солих, хуучин session хаах, atomic CMS save, 30 хоногийн эрх ба сунгалт, migration дахин ажиллах.
- Productdrop: байгаа 58 тест тэнцсэн; Netlify build тэнцсэн. Apps Script тестийн mock-д шинээр ашигласан стандарт getValue/getValues үйлдлүүдийг нэмсэн, шинэ ledger-ийн давхар бичилт үүсэхгүйг шалгасан. Хуучин temporary_password-ийн тестийг одоогийн эзэмшигч шалгасан reset урсгалд тааруулсан.
- Mongolsub: 001–011 SQL migration болон үлдэгдэлтэй төлбөртэй кредитийн шинэ тайлан тэнцсэн. Source check тэнцсэн.
- Productdrop тайлангийн тооцоолол: бодит мэдэгдэж буй дүнг нэмэх, хуучин тодорхойгүй баталсан огноог сарын орлогод таамгаар оруулахгүй байх.
- 174 тусдаа script, 78 inline script-ийн syntax; Adult HTML-ийн давхардсан ID, script/style холбоосын шалгалт тэнцсэн.

## Браузераар хийсэн

Зөвхөн localhost дахь тусдаа туршилтын өгөгдөл, цэцгийн зураг, 4 секундийн хиймэл аудиогоор:

- Нэвтрэх → өгүүллэгийн төлбөрийн хүсэлт → төлсөн мэдэгдэл → админы батлах → бүтэн текст/аудио нээгдэх.
- Shared Adult удирдлагыг гурван төслийн панель дотор холбож, захиалга батлах, эрх цуцлах, тайлангийн өөрчлөлтийг харсан. Productdrop/Mongolsub-ийн UI жишээ тайлангийн хариу ашигласан; тэдний бодит серверийг браузераас шалгаагүй. Бүтэн DropDashboard-ийн гаднах нэвтрэх хаалга, хуучин бүх хэрэгслээр нэвтэрч туршаагүй.
- Бүтэн аудио play/pause/хугацаа; saved library болон аудионы явц өөр цонхонд синк хийх.
- CMS ноорог гарчиг/тайлбарыг өөр цонхноос сэргээх.
- Media Library-д HTTPS зураг URL нэмэх, grid-ээс Hero сонгох, crop хадгалах.
- Desktop дээр 1280 px, утасны 390 px болон 320 px өргөн. Энэ нь браузерын responsive шалгалт; бодит утасны hardware/network хэмжилт биш.
- Бүтэн өргөнтэй reader header, зураг дээр нэг гарчиг, картын нэрийн давхардалгүй байдал, текстийн ижил 3 мөрийн өндөр.
- Браузерын Back → нүүр, Forward → өгүүллэг; сайтын «Өгүүллэгүүд рүү буцах» товч.
- Editor-ийн Hero preview болон public view: desktop дээр 1280 px viewport, 1265 px зураг, 714.84375 px өндөр, crop 50% / 100%, Zoom 101% ижил. Утасны preview/public хоёулаа 390 px viewport, 640 px Hero, ижил crop/zoom.
- Шалгасан нүүр, унших хуудас, CMS болон isolated төслийн панелийн консолд алдаа/анхааруулга гараагүй.
- Cloudinary responsive source variant болон Onest кирилл font ашиглагдаж байгааг харсан. Production cover ачаалах хугацааг хэмжээгүй.

## Mongolsub-ийн бусад тест

393 тестээс 389 тэнцсэн, 4 нь хадмал зургийн pixel/font/emoji дүрслэл дээр алдаатай:

1. actual Box painter applies the extended text shadow and produces different visible pixels
2. Fast Paced emoji on/off and row frequency affect the shared painter at matching positions
3. Fast Paced auto emoji also draws a deterministic fallback for text without a keyword match
4. mixed font sizes and small caps keep Box and Sweep centered with non-overlapping word bounds

Эдгээрийн public/index.html болон тестийн эх код нь хэрэглэгчийн ChimegeSUB-main (1).zip-ээс өөрчлөгдөөгүйг byte-аар харьцуулсан. Энэ шинэчлэлийн хүрээнд хадмалын дүрслэлийг засварлаагүй. Тиймээс Mongolsub-ийн бүх тестийг тэнцсэн гэж үзээгүй.

## Production дээр баталгаажаагүй

Бодит Netlify deploy, Supabase-ийн hosted permission/storage, Cloudinary/Supabase бодит upload, банкны мөнгө, SMS шалгаагүй. SQL нь PGlite PostgreSQL загвар дээр, provider нь тусгаарласан fixture хариутай ажилласан. Иймээс production-ийн environment, түлхүүр, migration суулгасны дараах live шалгалт шаардлагатай.

file:// туслах дэлгэц, зөв хавтсыг quote хийсэн Terminal команд нь кодын шалгалтаар баталгаажсан. Браузерын хэрэгсэл file: protocol нээхийг хориглосон тул file://-ийн UI-г браузераар баталгаажуулаагүй. HTTP дээр admin.html render, local CMS ажиллагаа шалгагдсан.

ZIP-үүдэд тестийн хуурамч хэрэглэгч, fixture сервер, node_modules, private key, .env, build dist оруулаагүй. Бодит хэрэглэгчийн өгөгдлийг өөрчлөөгүй. Архивын CRC, шаардлагатай root файлуудыг багцалсны дараа шалгасан.
