# אבטחה ופרטיות

האפליקציה מחזיקה מידע אישי, לכן האבטחה בנויה לתוך הארכיטקטורה.

| דרישה | מימוש |
|---|---|
| Encrypted transport | כל התקשורת HTTPS/TLS מול Supabase; האפליקציה מסרבת ל-URL שאינו https מחוץ לפיתוח (`lib/env.ts`) |
| Secure token storage | ה-session של Supabase נשמר ב-Keychain/Keystore דרך `expo-secure-store` (`AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, מחולק לחלקים) — לא ב-AsyncStorage |
| Authentication | Supabase Auth, Email OTP (ללא סיסמאות), PKCE, רוטציית refresh tokens; רענון רק כשהאפליקציה בחזית |
| Database access control | RLS על כל טבלה: `user_id = auth.uid()`. חיפוש המסמכים (`match_document_chunks`) הוא `SECURITY INVOKER` כך ש-RLS חל גם עליו. Storage פרטי עם תיקייה לכל משתמש. נבדק ב-`supabase/tests` |
| המודל לא ניגש ל-DB/OS | שכבת כלים בלבד, zod על כל קלט, אישור לפעולות חיצוניות/הרסניות. `/ai-chat` לא מריץ כלים |
| Prompt injection | תוכן ממסמכים, שיתופים ותמונות מסומן כ-"data, not instructions" ב-prompt ובתוצאות הכלים; פעולות משמעותיות דורשות אישור אנושי בכל מקרה |
| Audit log | `activity_log` — append-only ללקוח (אין policy ל-UPDATE), נצפה במסך "פעילות העוזר" |
| Least privilege | הרשאות מערכת מתבקשות רק בשימוש הראשון; באנדרואיד הרשאות מיותרות חסומות במפורש (`blockedPermissions`); יומן/אנשי קשר נקראים מקומית, אנשי קשר לא מועלים |
| Secrets management | מפתחות AI/תמלול/embeddings/service-role רק ב-Supabase secrets. בבאנדל של האפליקציה יש רק URL ו-anon key (ציבוריים מטבעם) |
| מכסות | `ai_usage` + `bump_ai_usage` (service role בלבד) — מגבלת בקשות יומית למשתמש (`AI_DAILY_REQUEST_LIMIT`) |
| Delete / export | "ייצוא כל המידע" (`/export-data` → JSON + קישורים חתומים לקבצים) ו"מחיקת החשבון" (`/delete-account` → מחיקת קבצים ומשתמש; FK cascade מוחק הכול) |
| זיכרון רגיש | `sensitive.ts` מזהה ת.ז. (ספרת ביקורת), כרטיסי אשראי (Luhn), IBAN/חשבון בנק, סיסמאות, מידע רפואי ומסמכים מזהים — העוזר מסרב לשמור; המשתמש יכול לשמור ידנית אחרי אזהרה |
| נעילה | Face ID / טביעת אצבע בפתיחה ובחזרה מהרקע (אופציונלי) |
| הודעות החוצה | תמיד כרטיס אישור עם הטקסט המלא + ה-composer של מערכת ההפעלה — שום דבר לא נשלח בשקט |
| שגיאות | Edge Functions לא מחזירות stack traces או שגיאות ספק ללקוח |
| CORS | דפדפנים חסומים אלא אם הוגדרו ב-`ALLOWED_ORIGINS`; אפליקציות native לא שולחות Origin |

## מה נשלח לספק ה-AI

רק מה שנדרש לבקשה: ההודעות בחלון השיחה, תוצאות הכלים שהמודל ביקש (למשל 5 אנשי קשר תואמים ולא כל ספר הכתובות), ותמונות/מסמכים שהמשתמש צירף. מומלץ להגדיר מול הספק מדיניות שמירת נתונים מתאימה (למשל zero data retention כשזמין).
