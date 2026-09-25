import { useColorScheme } from "react-native";

const light = {
  bg: "#F6F4EF",
  surface: "#FFFFFF",
  surfaceMuted: "#EFECE5",
  border: "#E4E0D7",
  text: "#16181D",
  textSecondary: "#5E6470",
  textTertiary: "#9398A3",
  accent: "#1F3A5F",
  accentSoft: "#E3E9F2",
  onAccent: "#FFFFFF",
  success: "#2F7A55",
  successSoft: "#E1F0E7",
  warning: "#A5670F",
  warningSoft: "#F7ECD9",
  danger: "#B3261E",
  dangerSoft: "#F8E1DF",
  overlay: "rgba(22,24,29,0.35)",
};

const dark: typeof light = {
  bg: "#0E1014",
  surface: "#171A20",
  surfaceMuted: "#1F232B",
  border: "#2A2F38",
  text: "#F1F2F4",
  textSecondary: "#A9AEB8",
  textTertiary: "#6D7380",
  accent: "#8FB3E6",
  accentSoft: "#1C2A3D",
  onAccent: "#0E1014",
  success: "#6CC495",
  successSoft: "#15291E",
  warning: "#E4AE5A",
  warningSoft: "#2E2414",
  danger: "#F2867D",
  dangerSoft: "#3A1C1A",
  overlay: "rgba(0,0,0,0.55)",
};

export type Palette = typeof light;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;
export const radius = { sm: 10, md: 14, lg: 20, pill: 999 } as const;

export const type = {
  display: { fontSize: 30, lineHeight: 36, fontWeight: "700" as const, letterSpacing: -0.4 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700" as const, letterSpacing: -0.2 },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600" as const },
  body: { fontSize: 16, lineHeight: 23, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: "600" as const },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: "400" as const },
  label: { fontSize: 12, lineHeight: 16, fontWeight: "600" as const, letterSpacing: 0.3 },
};

export function useTheme(): Palette & { dark: boolean } {
  const scheme = useColorScheme();
  return scheme === "dark" ? { ...dark, dark: true } : { ...light, dark: false };
}
