import React from "react";
import type { ColorValue } from "react-native";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { listInbox } from "@/data/inbox";
import { qk } from "@/state/queries";
import { useTheme } from "@/theme/tokens";

type IconName = React.ComponentProps<typeof Ionicons>["name"];

export default function TabsLayout() {
  const c = useTheme();
  const inbox = useQuery({ queryKey: qk.inbox, queryFn: () => listInbox("new") });
  const icon = (name: IconName) =>
    function TabIcon({ color, size }: { color: ColorValue; size: number }) {
      return <Ionicons name={name} color={color as string} size={size - 2} />;
    };
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.textTertiary,
        tabBarStyle: { backgroundColor: c.surface, borderTopColor: c.border },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600" },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "היום", tabBarIcon: icon("sunny-outline") }} />
      <Tabs.Screen name="tasks" options={{ title: "משימות", tabBarIcon: icon("checkbox-outline") }} />
      <Tabs.Screen
        name="inbox"
        options={{ title: "Inbox", tabBarIcon: icon("file-tray-outline"), tabBarBadge: inbox.data?.length ? inbox.data.length : undefined }}
      />
      <Tabs.Screen name="projects" options={{ title: "פרויקטים", tabBarIcon: icon("folder-open-outline") }} />
      <Tabs.Screen name="more" options={{ title: "עוד", tabBarIcon: icon("ellipsis-horizontal") }} />
    </Tabs>
  );
}
