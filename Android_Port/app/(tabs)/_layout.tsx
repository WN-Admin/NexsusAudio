import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { MiniPlayer } from "@/components/mini-player";

function TabBarWithPlayer() {
  return null; // MiniPlayer is rendered inside the tab bar footer
}

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  const tabBarHeight = 56 + bottomPadding;

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.muted,
          headerShown: false,
          tabBarButton: HapticTab,
          tabBarStyle: {
            paddingTop: 8,
            paddingBottom: bottomPadding,
            height: tabBarHeight,
            backgroundColor: colors.background,
            borderTopColor: colors.border,
            borderTopWidth: 0.5,
          },
          tabBarLabelStyle: {
            fontSize: 10,
            fontWeight: '600',
            marginTop: 2,
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Download",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={24} name="arrow.down.circle.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="tagger"
          options={{
            title: "Tag Editor",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={24} name="tag.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="p2p"
          options={{
            title: "P2P",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={24} name="person.2.fill" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color }) => (
              <IconSymbol size={24} name="gearshape.fill" color={color} />
            ),
          }}
        />
      </Tabs>
      <MiniPlayer />
    </View>
  );
}
