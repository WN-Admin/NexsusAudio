import { DarkTheme, DefaultTheme, ThemeProvider } from "@react-navigation/native";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import "react-native-reanimated";
import "../global.css";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider as NexsusThemeProvider } from "@/lib/theme-provider";
import { AudioPlayerProvider } from "@/lib/audio-player-context";
import { DownloadProvider } from "@/lib/download-context";
import { SettingsProvider } from "@/lib/settings-context";
import { useColorScheme } from "@/hooks/use-color-scheme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  useEffect(() => {
    SplashScreen.hideAsync();
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NexsusThemeProvider>
          <SettingsProvider>
            <DownloadProvider>
              <AudioPlayerProvider>
                <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
                  <Stack>
                    <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <StatusBar style="auto" />
                </ThemeProvider>
              </AudioPlayerProvider>
            </DownloadProvider>
          </SettingsProvider>
        </NexsusThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
