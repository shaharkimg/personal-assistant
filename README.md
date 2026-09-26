# עוזר אישי — Personal Assistant

אפליקציית מובייל (iOS + Android) שהיא עוזר אישי אמיתי: מכירה את ההקשר שלך, עובדת עם היומן, אנשי הקשר, המסמכים והמשימות שלך, זוכרת התחייבויות ועוקבת אחרי מה שמחכה לתשובה — ומבצעת פעולות רק דרך שכבת כלים מבוקרת, עם אישור לפני כל דבר חיצוני או בלתי הפיך.

## מה יש כאן

| תחום | מה עובד |
|---|---|
| **מסך הבית** | ברכה לפי שעה, תקציר חכם ("יש לך היום 3 פגישות, 4 משימות פתוחות ודבר אחד שממתין לתשובה"), כרטיסים: הפגישה הבאה, משימות להיום, ממתינים לתשובה, תזכורות, "כדאי לטפל", מסמכים אחרונים, ושדה "מה תרצה שאעשה?" עם כתיבה ומיקרופון |
| **צ'אט עם העוזר** | הבנת כוונה חופשית (לא פקודות), שרשור כלים, שיחות נשמרות וניתנות לחידוש |
| **קול** | הקלטה → Speech-to-Text (שירות נפרד, ספק מתחלף) → AI → כלי → תשובה |
| **משימות** | כל השדות שביקשת, 6 סטטוסים, עדיפויות, פרויקטים, תגיות, משימות חוזרות (יומי/שבועי לפי ימים/חודשי/שנתי) |
| **Follow-up חכם** | מודל `WaitingFor` נפרד, התראה כשעבר המועד, "רוצה שאכין הודעת follow-up?", טיוטה → אישור → שליחה |
| **יומן** | קריאה/יצירה/עריכה/מחיקה, בדיקת זמינות, זיהוי התנגשויות, הצעת 2–3 חלונות כשהזמן עמום. שכבת `CalendarProvider` עם תכנון ל-Google/Outlook |
| **אנשי קשר** | `ContactsService` — חיפוש מקומי בלבד, ספר הכתובות לא עולה לשרת |
| **מסמכים** | PDF, Word, Excel, תמונות, סריקה במצלמה; File → חילוץ טקסט → chunking → embeddings → חיפוש היברידי. "מה כתוב בהסכם עם X?", "תמצא את הסעיף על תקופת ההתקשרות", "תשווה בין שני ההסכמים" |
| **מצלמה** | צילום/סריקה מתוך הצ'אט; המודל רואה את התמונה ויכול לשמור אותה כמסמך |
| **Share to Assistant** | Share Extension ב-iOS ו-Intent Filters באנדרואיד: PDF, קישור, תמונה, טקסט → "מה לעשות עם זה?" |
| **התראות** | מתוכננות מנתונים אמיתיים: פגישה בעוד 30 דק׳, משימה חשובה שלא הושלמה, "עברו 3 ימים ולא סימנת שקיבלת תשובה מדני", "יש לך 20 דקות פנויות". 4 רמות יוזמה + שעות שקט. Push מהשרת למעקבים גם כשהאפליקציה סגורה |
| **תקציר בוקר / סיכום ערב** | נבנים דטרמיניסטית מהנתונים — אין שום פריט שלא קיים במערכת |
| **זיכרון** | הפרדה בין הקשר קצר-טווח (שיחות), מצב משימות/פרויקטים, העדפות ארוכות-טווח, אנשים, מסמכים. הכול נצפה ונמחק. מידע רגיש לא נשמר אוטומטית |
| **פרויקטים** | משימות, מסמכים, הערות, אנשים, דדליין ושיחות לכל פרויקט |
| **Universal Inbox** | טקסט/קול/קובץ/תמונה/קישור → סיווג AI (Task/Note/Document/Reminder/Event/Waiting/Reference) → המשתמש מאשר או מתקן |
| **Quick Capture** | Quick Actions במסך הבית (לכידה, דיבור, סריקה, תקציר) + deep link `personalassistant://capture` — פעולה אחת, בלי שאלות, וסוגר |
| **מועדים ממסמכים** | "חלץ מועדים" במסך מסמך (או בצ'אט): העוזר קורא את המסמך ומציע בכרטיס אחד את כל המועדים, עם ציטוט המקור ותזכורת 3 ימים לפני |
| **סיכום פגישה** | 5 דקות אחרי פגישה (או "סכם פגישה" בלחיצה ארוכה על האייקון): מקליטים דקה → הערת סיכום, משימות ומעקבים באישור אחד, והצעה לטיוטת follow-up |
| **התראות פעולה** | תקציר הבוקר מציג את היום בפועל בהתראה עצמה; תזכורות עם כפתורי "בוצע" / "דחה למחר" |
| **Activity Log** | כל פעולה משמעותית נרשמת (מי, מה, מתי) — append-only |
| **פרטיות ואבטחה** | ראה [docs/SECURITY.md](docs/SECURITY.md) |

## מבנה

```
personal-assistant/
├── app/                       # Expo (React Native) — SDK 57, Expo Router, TypeScript
│   ├── src/app/               # מסכים (file-based routing)
│   ├── src/assistant/         # מנוע הסוכן, שכבת הכלים, prompt
│   │   ├── engine.ts          #   לולאת model → tools → confirm → execute
│   │   ├── registry.ts        #   ולידציה (zod) + סיווג סיכון לכל קריאה
│   │   └── tools/             #   ~40 כלים: tasks, waiting, calendar, contacts, documents, briefs, projects, memory, inbox
│   ├── src/domain/            # לוגיקה טהורה ונבדקת: recurrence, availability, briefs, proactive planner, sensitive-data guard
│   ├── src/data/              # repositories מול Supabase (RLS), כל שינוי נרשם ב-audit log
│   ├── src/services/          # AI gateway, Transcription, Calendar, Contacts, Documents, Notifications, Messaging, Share, App lock
│   └── tests/                 # vitest
├── supabase/
│   ├── migrations/            # סכימה, RLS, pgvector, חיפוש היברידי, מכסות AI
│   ├── functions/             # Edge Functions (Deno): ai-chat, transcribe, ingest-document, search-documents, export-data, delete-account, proactive-scan
│   │   └── _shared/ai/        # AIProvider interface + Anthropic + OpenAI
│   ├── sql/                   # תזמון אופציונלי (pg_cron)
│   └── tests/                 # בדיקות RLS מול Postgres אמיתי (PGlite + pgvector)
└── docs/                      # ARCHITECTURE.md, SECURITY.md, ROADMAP.md
```

## הרצה

### 1. Backend (Supabase)

```bash
supabase link --project-ref <ref>
supabase db push                                   # מריץ את המיגרציה
cp supabase/.env.example supabase/.env             # למלא מפתחות
supabase secrets set --env-file supabase/.env
supabase functions deploy ai-chat transcribe ingest-document search-documents export-data delete-account proactive-scan
```

- ספק ה-AI נבחר ב-`AI_PROVIDER` (`anthropic` / `openai`) ו-`AI_MODEL`. ברירת המחדל: Anthropic `claude-opus-5` עם adaptive thinking ו-refusal fallback בצד השרת (`AI_REFUSAL_FALLBACK=false` מכבה).
- Embeddings ותמלול: כל endpoint תואם OpenAI (`EMBEDDINGS_BASE_URL`, `TRANSCRIPTION_BASE_URL`). בלי מפתח embeddings החיפוש עובר ל-full-text בלבד.
- התראות שרת כשהאפליקציה סגורה: הרץ את `supabase/sql/schedule_proactive_scan.sql` (דורש pg_cron + pg_net).
- Auth: Email OTP (קוד בן 6 ספרות). ב-Dashboard → Auth → Email Templates הוסף `{{ .Token }}` לתבנית.

### 2. אפליקציה

```bash
cd app
npm install
cp .env.example .env                               # רק URL + anon key ציבוריים
npx expo run:ios        # או run:android — Development Build
```

Expo Go **לא מספיק**: Share Extension, סורק מסמכים, יומן/אנשי קשר מלאים ו-Quick Actions דורשים Development Build (`npx expo run:*` מקומית או `eas build --profile development`). התיקיות `ios/` ו-`android/` נוצרות אוטומטית (CNG) מ-`app.config.ts`.

### 3. בדיקות

```bash
cd app && npm run typecheck && npm test && npm run lint     # 38 בדיקות: דומיין, מנוע הסוכן, chunking
cd ../supabase/tests && npm install && npm test              # 10 בדיקות מסד: RLS, audit log, מכסות, מחיקה מלאה
deno check supabase/functions/*/index.ts                     # טיפוסי Edge Functions
```

## מסמכים נוספים

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — איך זה בנוי ולמה, והרחבה ביכולות חדשות
- [docs/SECURITY.md](docs/SECURITY.md) — מודל האבטחה והפרטיות
- [docs/ROADMAP.md](docs/ROADMAP.md) — מה בתכנון (Widgets, Google/Outlook ישיר, אימייל ועוד)
