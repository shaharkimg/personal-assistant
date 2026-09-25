import React from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { radius, space, type, useTheme } from "@/theme/tokens";

export type IconName = React.ComponentProps<typeof Ionicons>["name"];

type Tone = "primary" | "secondary" | "tertiary" | "accent" | "danger" | "success" | "warning" | "onAccent";

export function T({
  variant = "body",
  tone = "primary",
  style,
  ...rest
}: TextProps & { variant?: keyof typeof type; tone?: Tone }) {
  const c = useTheme();
  const color = {
    primary: c.text,
    secondary: c.textSecondary,
    tertiary: c.textTertiary,
    accent: c.accent,
    danger: c.danger,
    success: c.success,
    warning: c.warning,
    onAccent: c.onAccent,
  }[tone];
  return <Text {...rest} style={[type[variant], { color, textAlign: "left", writingDirection: "rtl" }, style]} />;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  edges = ["top"],
  footer,
  refreshControl,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  padded?: boolean;
  edges?: ("top" | "bottom")[];
  footer?: React.ReactNode;
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
}) {
  const c = useTheme();
  const pad = padded ? { paddingHorizontal: space.lg } : null;
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {scroll ? (
        <ScrollView
          contentContainerStyle={[pad, { paddingBottom: 120, paddingTop: space.sm }]}
          keyboardShouldPersistTaps="handled"
          refreshControl={refreshControl}
        >
          {children}
        </ScrollView>
      ) : (
        <View style={[{ flex: 1 }, pad]}>{children}</View>
      )}
      {footer}
    </SafeAreaView>
  );
}

export function Card({
  children,
  style,
  onPress,
  tone = "default",
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  tone?: "default" | "accent" | "warning" | "muted";
}) {
  const c = useTheme();
  const bg = { default: c.surface, accent: c.accentSoft, warning: c.warningSoft, muted: c.surfaceMuted }[tone];
  const body = (
    <View
      style={[
        {
          backgroundColor: bg,
          borderRadius: radius.lg,
          padding: space.lg,
          borderWidth: tone === "default" ? StyleSheet.hairlineWidth : 0,
          borderColor: c.border,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1, transform: [{ scale: pressed ? 0.99 : 1 }] })}>
      {body}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  disabled,
  style,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const c = useTheme();
  const bg = { primary: c.accent, secondary: c.surfaceMuted, ghost: "transparent", danger: c.dangerSoft }[variant];
  const fg = { primary: c.onAccent, secondary: c.text, ghost: c.accent, danger: c.danger }[variant];
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled || loading}
      onPress={() => {
        void Haptics.selectionAsync().catch(() => undefined);
        onPress();
      }}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.pill,
          paddingVertical: compact ? 8 : 13,
          paddingHorizontal: compact ? 14 : 20,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={compact ? 16 : 18} color={fg} /> : null}
      <Text style={[compact ? type.caption : type.bodyStrong, { color: fg, fontWeight: "600" }]}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  icon,
  onPress,
  size = 22,
  tone = "default",
  accessibilityLabel,
  style,
  ...rest
}: Omit<PressableProps, "style"> & {
  icon: IconName;
  size?: number;
  tone?: "default" | "accent" | "filled" | "danger";
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  const c = useTheme();
  const filled = tone === "filled";
  return (
    <Pressable
      {...rest}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        {
          width: size + 20,
          height: size + 20,
          borderRadius: radius.pill,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: filled ? c.accent : "transparent",
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Ionicons
        name={icon}
        size={size}
        color={filled ? c.onAccent : tone === "accent" ? c.accent : tone === "danger" ? c.danger : c.textSecondary}
      />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  icon,
  tone = "default",
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: "default" | "warning" | "success" | "danger";
}) {
  const c = useTheme();
  const toneBg = { default: c.surfaceMuted, warning: c.warningSoft, success: c.successSoft, danger: c.dangerSoft }[tone];
  const toneFg = { default: c.textSecondary, warning: c.warning, success: c.success, danger: c.danger }[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: radius.pill,
        backgroundColor: selected ? c.accent : toneBg,
      }}
    >
      {icon ? <Ionicons name={icon} size={14} color={selected ? c.onAccent : toneFg} /> : null}
      <Text style={[type.caption, { color: selected ? c.onAccent : toneFg, fontWeight: "600" }]}>{label}</Text>
    </Pressable>
  );
}

export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: space.xl, marginBottom: space.sm }}>
      <T variant="label" tone="tertiary">
        {title.toUpperCase()}
      </T>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <T variant="caption" tone="accent">
            {action}
          </T>
        </Pressable>
      ) : null}
    </View>
  );
}

export function Row({
  title,
  subtitle,
  icon,
  onPress,
  right,
  titleStyle,
}: {
  title: string;
  subtitle?: string | null;
  icon?: IconName;
  onPress?: () => void;
  right?: React.ReactNode;
  titleStyle?: StyleProp<TextStyle>;
}) {
  const c = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: space.md, opacity: pressed ? 0.7 : 1 })}
    >
      {icon ? (
        <View style={{ width: 34, height: 34, borderRadius: radius.sm, backgroundColor: c.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
          <Ionicons name={icon} size={18} color={c.accent} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <T variant="body" style={titleStyle} numberOfLines={2}>
          {title}
        </T>
        {subtitle ? (
          <T variant="caption" tone="secondary" numberOfLines={2}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right ?? (onPress ? <Ionicons name="chevron-back" size={18} color={c.textTertiary} /> : null)}
    </Pressable>
  );
}

export function Divider() {
  const c = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border }} />;
}

export function EmptyState({ icon, title, body, action }: { icon: IconName; title: string; body?: string; action?: React.ReactNode }) {
  const c = useTheme();
  return (
    <View style={{ alignItems: "center", paddingVertical: space.xxl, gap: space.sm }}>
      <Ionicons name={icon} size={36} color={c.textTertiary} />
      <T variant="heading" style={{ textAlign: "center" }}>
        {title}
      </T>
      {body ? (
        <T variant="caption" tone="secondary" style={{ textAlign: "center", maxWidth: 280 }}>
          {body}
        </T>
      ) : null}
      {action}
    </View>
  );
}

export function Header({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: space.md, marginBottom: space.md }}>
      <View style={{ flex: 1 }}>
        <T variant="display">{title}</T>
        {subtitle ? (
          <T variant="body" tone="secondary" style={{ marginTop: 4 }}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Loading() {
  const c = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: "center" }}>
      <ActivityIndicator color={c.accent} />
    </View>
  );
}
