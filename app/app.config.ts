import type { ExpoConfig } from "expo/config";

// Only public, non-secret values may be embedded in the client bundle. The Supabase anon key is
// designed to be public (RLS enforces access). All AI/transcription keys live in Supabase secrets.
const config: ExpoConfig = {
  name: "עוזר אישי",
  slug: "personal-assistant",
  scheme: "personalassistant",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: process.env.IOS_BUNDLE_ID ?? "com.shahar.personalassistant",
    supportsTablet: false,
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: process.env.ANDROID_PACKAGE ?? "com.shahar.personalassistant",
    adaptiveIcon: {
      backgroundColor: "#F6F4EF",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    // Least privilege: only what features actually use. Everything else is blocked explicitly.
    permissions: [
      "android.permission.READ_CALENDAR",
      "android.permission.WRITE_CALENDAR",
      "android.permission.READ_CONTACTS",
      "android.permission.RECORD_AUDIO",
      "android.permission.CAMERA",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.USE_BIOMETRIC",
    ],
    blockedPermissions: [
      "android.permission.WRITE_CONTACTS",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
      "android.permission.READ_EXTERNAL_STORAGE",
      "android.permission.WRITE_EXTERNAL_STORAGE",
      "android.permission.SYSTEM_ALERT_WINDOW",
    ],
    predictiveBackGestureEnabled: false,
  },
  web: { favicon: "./assets/favicon.png" },
  plugins: [
    "expo-router",
    "expo-dev-client",
    "expo-secure-store",
    "expo-localization",
    "expo-font",
    ["expo-splash-screen", { backgroundColor: "#F6F4EF", image: "./assets/icon.png", imageWidth: 120 }],
    ["expo-calendar", { calendarPermission: "העוזר קורא ומעדכן את היומן שלך כדי לקבוע פגישות, לבדוק זמינות ולהכין סיכום יומי." }],
    ["expo-contacts", { contactsPermission: "העוזר מחפש אנשי קשר במכשיר כשאתה מבקש להתקשר או לשלוח הודעה. אנשי הקשר לא מועלים לשרת." }],
    ["expo-audio", { microphonePermission: "המיקרופון משמש להקלטת בקשות קוליות לעוזר." }],
    [
      "expo-image-picker",
      {
        cameraPermission: "המצלמה משמשת לצילום מסמכים, קבלות ומכתבים עבור העוזר.",
        photosPermission: "גישה לתמונות שתבחר כדי לצרף אותן לעוזר.",
        microphonePermission: false,
      },
    ],
    ["react-native-document-scanner-plugin", { cameraPermission: "המצלמה משמשת לסריקת מסמכים." }],
    ["expo-local-authentication", { faceIDPermission: "נעילת האפליקציה באמצעות Face ID." }],
    ["expo-notifications", { color: "#1F3A5F" }],
    "expo-mail-composer",
    "expo-sharing",
    "expo-quick-actions",
    [
      "expo-share-intent",
      {
        iosShareExtensionName: "שלח לעוזר",
        iosActivationRules: {
          NSExtensionActivationSupportsText: true,
          NSExtensionActivationSupportsWebURLWithMaxCount: 1,
          NSExtensionActivationSupportsImageWithMaxCount: 5,
          NSExtensionActivationSupportsFileWithMaxCount: 5,
        },
        androidIntentFilters: ["text/*", "image/*", "*/*"],
        androidMultiIntentFilters: ["image/*", "*/*"],
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: {
    supportsRTL: true,
    forcesRTL: true,
    supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
    eas: { projectId: process.env.EAS_PROJECT_ID },
  },
};

export default config;
