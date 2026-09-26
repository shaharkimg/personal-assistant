# Roadmap

## Widgets ו-Quick Capture מתקדם
- **iOS WidgetKit** (לכידה מהירה + "הבא בתור") דרך `@bacons/apple-targets` — widget שפותח `personalassistant://capture`. דורש App Group משותף עם ה-Share Extension.
- **Android widget** דרך `react-native-android-widget`.
- **Siri Shortcuts / App Intents** ו-**Android App Actions** ("היי סירי, תגיד לעוזר…"). עד אז: Shortcut מסוג "Open URL" עם `personalassistant://capture?voice=1` עובד כבר היום.
- Lock-screen / Action Button ב-iPhone לאותו deep link.

## אינטגרציות
- **Google Calendar / Outlook ישירות** — `GoogleCalendarProvider` / `OutlookCalendarProvider` מוכנים כ-interface; התוכנית (OAuth PKCE, refresh token מוצפן ב-Vault, `calendar-proxy`) מתועדת ב-`RemoteCalendarProviders.ts`.
- **אימייל**: Gmail מחובר (IMAP/SMTP + סיסמת אפליקציה). הבא: Outlook דרך Microsoft Graph, ומיילים שממתינים לתשובה בתקציר הבוקר.
- **WhatsApp Business / SMS ישיר** — כרגע נפתח composer של המערכת (המשתמש לוחץ שלח).

## מוצר
- Streaming של תשובות (SSE) לצ'אט.
- תמלול on-device כ-`TranscriptionService` חלופי (פרטיות + offline).
- תור offline ללכידה מהירה (כרגע: נשמר ל-Inbox כשהמודל לא זמין, אבל דורש רשת ל-Supabase).
- Background task שמתכנן התראות גם בלי לפתוח את האפליקציה (`expo-background-task`).
- השוואת מסמכים ויזואלית (diff של סעיפים).
- הצעות זיכרון יזומות ("לזכור שאתה מעדיף פגישות בבוקר?") עם אישור.
- Evals לעוזר: סט בקשות אמיתיות בעברית + בדיקה אוטומטית של בחירת כלים.
