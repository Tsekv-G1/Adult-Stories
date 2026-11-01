# Adult Stories v8.3 · шалгалтын үр дүн

2026-11-01 · Зөвхөн Adult Stories-д өөрчлөлт хийсэн.

- Шинэ 18 regression тест тэнцсэн: хаасан/өөр хэрэглэгчийн төлбөрийн хариу, modal солих, login дараах checkout, upscale eligibility/423 retry/fallback/resize дараалал, draft revision/owner/story isolation/cleanup error, audio replay, давхар CMS save, HTML→JSON алдааны мэдэгдэл, Supabase payload.
- Өмнөх 5 frontend regression тэнцсэн.
- Backend/SQL-ийн 20 шалгалт тэнцсэн; entitlement-гүй/anonymous хэрэглэгчид бүтэн аудио/текст авахгүй; эрхтэй хэрэглэгчид шууд HTTPS MP3 URL өөрчлөлтгүй ирдэг; буруу scheme буцаж ирэхгүй.
- Кодын 22 script, 3 inline script, HTML-ийн ID/asset холбоосын шалгалт тэнцсэн.
- Локал браузерт 4 секундийн хиймэл аудио URL тоглож duration=4, paused=false болсон. Дууссан аудиог Replay дарахад 0 секундээс эхэлсэн.
- Editor-д full URL оруулж 0:04 хугацааг уншаад шинэ ноорог хадгалсан; аудио file-upload талбарын тоо 0. Консолд error/warn гараагүй.
- Desktop 1280px, mobile 390px харагдац; search clear ажилласан. Энэ нь browser viewport-ийн шалгалт, бодит утасны hardware/network хэмжилт биш.
- Cloudinary бодит AI upscale хийх эсвэл шинэ бодит зураг upload хийж баталгаажуулаагүй. Provider 423/403/HTML хариу болон resize дарааллыг mock-оор шалгасан. Акаунтын зөвшөөрөл, quota, AI гаралтын чанарыг шалгаагүй.
- Production deploy, бодит банк/SMS/хэрэглэгчийн эрх өөрчлөөгүй. Тестийн PostgreSQL загвар, 4 секундийн tone, цэцгийн зураг ашигласан.

Бүрэн ZIP/8.2-оос шинэчлэх patch-ийн CRC болон шаардлагатай файлуудыг багцалсны дараа шалгасан. Provider-ийн боломж болон public MP3 холбоосын хязгаарлалтыг README-д бичсэн.
