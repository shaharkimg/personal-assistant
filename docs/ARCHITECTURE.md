# ארכיטקטורה

## עקרון מנחה

המודל **מחליט**, האפליקציה **מבצעת**. למודל אין גישה ישירה למסד הנתונים, ל-API של מערכת ההפעלה או למפתחות. כל יכולת חשופה אליו רק ככלי (tool) עם סכמה, ולידציה ורמת סיכון.

```
 ┌──────────── Mobile app (Expo) ─────────────────────────────────────┐
 │                                                                    │
 │  UI (Home, Chat, Capture, Inbox…)                                  │
 │     │ text / voice / files                                         │
 │     ▼                                                              │
 │  AssistantEngine ──► AIGateway ─────────── HTTPS + JWT ────────────┼──► /ai-chat ──► AIProvider
 │     │  ▲                                                           │     (Supabase    ├─ AnthropicProvider
 │     │  │ tool_result                                               │      Edge Fn)    └─ OpenAIProvider
 │     ▼  │                                                           │
 │  ToolRegistry: zod validate → risk (safe | confirm) → execute      │
 │     │                         └─► ConfirmationCard [שלח][ערוך][בטל]│
 │     ▼                                                              │
 │  Repositories (RLS) · CalendarService · ContactsService ·          │
 │  DocumentService · MessagingService · NotificationService          │
 │     │                  │ on-device only                            │
 └─────┼──────────────────┼───────────────────────────────────────────┘
       ▼                  ▼
  Supabase Postgres    OS calendar / contacts / camera / files
  (RLS, pgvector)
```

### למה לולאת הסוכן רצה על המכשיר?

חלק גדול מהכלים עובד על מידע שנמצא **רק במכשיר**: היומן (כולל חשבונות Google/Exchange שמסונכרנים למערכת), אנשי הקשר, קבצים ומצלמה. הרצת הלולאה במכשיר מאפשרת להשתמש בהם בלי להעלות את ספר הכתובות או היומן לשרת. השרת אחראי רק לקריאה למודל (עם המפתחות), מכסות, חילוץ טקסט, embeddings ותמלול.

פונקציית `/ai-chat` אינה מריצה כלים — לכן רשימת כלים שנשלחת מהלקוח לא מעניקה שום הרשאה. כל פעולה בפועל רצה תחת ה-JWT של המשתמש ו-RLS.

## שכבות

| שכבה | קבצים | אחריות |
|---|---|---|
| Domain | `app/src/domain/*` | לוגיקה טהורה ללא I/O: חזרתיות, זמינות והתנגשויות, תקצירים, מתכנן התראות, זיהוי מידע רגיש, סיווג heuristic. מכוסה בבדיקות |
| Data | `app/src/data/*` | Repositories מול Supabase. כל שינוי נרשם ב-`activity_log` עם `actor` (assistant/user/system) |
| Services | `app/src/services/*` | אינטגרציות: AI gateway, תמלול, יומן, אנשי קשר, מסמכים, התראות, הודעות, שיתוף, נעילה |
| Assistant | `app/src/assistant/*` | Prompt, Registry, כלים, Engine, Session |
| UI | `app/src/app/*`, `app/src/components/*` | Expo Router, מערכת עיצוב ב-`theme/tokens.ts` |
| Backend | `supabase/*` | סכימה + RLS, Edge Functions, ספקי AI |

## זרימת בקשה

1. המשתמש כותב/מדבר. קול → `TranscriptionService` → טקסט.
2. `useAssistant.send` מצמיד הקשר זמן (`[now: …]`) וקבצים (תמונות כ-vision, מסמכים עוברים ingestion ומקבלים id).
3. `AssistantEngine` שולח ל-`/ai-chat` את ההיסטוריה (חלון קצר-טווח), ה-system prompt (יציב ליום — טוב ל-prompt caching) והגדרות הכלים.
4. לכל `tool_call`: `ToolRegistry.prepare` → zod → סיכון.
   - `safe` → מתבצע מיד.
   - `confirm` → המנוע נעצר ומחזיר `needs_confirmation` עם preview; ה-UI מציג כרטיס. "ערוך" משנה שדה (למשל טקסט ההודעה) ו-`execute` מוודא שוב את הקלט.
5. תוצאות חוזרות למודל עד תשובה סופית (עד 10 צעדים). שגיאות ולידציה חוזרות למודל כדי שיתקן את עצמו.
6. אחרי פעולות: `invalidateAll()` מרענן מסכים ומתכנן מחדש התראות.

## רמות סיכון

| safe | confirm |
|---|---|
| יצירה/עדכון/השלמת משימות, תזכורות, מעקבים, הערות, פרויקטים; חיפוש וקריאה; יצירת אירוע ביומן **בלי** התנגשות | שליחת הודעה/אימייל, חיוג, מחיקת משימה, עריכת/ביטול אירוע, יצירת אירוע **עם** התנגשות, שמירה/מחיקה בזיכרון |

הסיכון יכול להיות פונקציה של הקלט (`createCalendarEvent` בודק התנגשויות בזמן אמת).

## זיכרון

| שכבה | איפה | חיים |
|---|---|---|
| הקשר קצר-טווח | `conversations`, `messages`; חלון של 40 הודעות אחרונות | עד מחיקה ע"י המשתמש |
| מצב משימות/פרויקטים | `tasks`, `waiting_for`, `projects`, `notes`, `inbox_items` | נתוני עבודה |
| העדפות ארוכות-טווח | `memories` — רק `user_explicit` / `user_approved`, נבדק מול `sensitive.ts` | עד מחיקה |
| ישויות | `people` — שם + מזהה מקומי של איש קשר, בלי טלפונים | עד מחיקה |
| מסמכים | `documents`, `document_chunks`, Storage פרטי | עד מחיקה |

## הוספת יכולת חדשה

1. כתוב כלי ב-`app/src/assistant/tools/<area>.ts` עם `defineTool({ name, description, schema, label, doneLabel, risk, preview?, run })`.
2. הוסף אותו ל-`tools/index.ts`.
3. אם צריך נתונים חדשים: מיגרציה חדשה ב-`supabase/migrations` עם RLS (`user_id = auth.uid()`), ו-repository ב-`app/src/data`.
4. אם יש אינטגרציה חיצונית: Service עם interface, מימוש מאחוריו — כמו `CalendarProvider`/`TranscriptionService`.

## החלפת ספק AI

- צ'אט: מחלקה חדשה שמממשת `AIProvider` ב-`supabase/functions/_shared/ai/`, ורישום ב-`getAIProvider()`. הפורמט הנייטרלי (`AIMessage`, `AIContentBlock`) מכסה טקסט, תמונות, PDF, קריאות כלים ותוצאות, ו-`providerState` שומר מצב ספציפי לספק (למשל thinking blocks) לשחזור מדויק.
- תמלול: `TranscriptionProvider` בשרת, `TranscriptionService` בלקוח (אפשר גם מימוש on-device).
- Embeddings: `EmbeddingProvider`. שינוי מימד דורש מיגרציה לעמודה `embedding`.
