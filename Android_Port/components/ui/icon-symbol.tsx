// Fallback for using MaterialIcons on Android and web.
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { SymbolWeight, SymbolViewProps } from "expo-symbols";
import { ComponentProps } from "react";
import { OpaqueColorValue, type StyleProp, type TextStyle } from "react-native";

type IconMapping = Record<string, ComponentProps<typeof MaterialIcons>["name"]>;
type IconSymbolName = keyof typeof MAPPING;

const MAPPING = {
  // Navigation
  "house.fill": "home",
  "paperplane.fill": "send",
  "chevron.left.forwardslash.chevron.right": "code",
  "chevron.right": "chevron-right",
  "chevron.left": "chevron-left",
  "chevron.down": "expand-more",
  "chevron.up": "expand-less",
  // NexsusAudio tabs
  "arrow.down.circle.fill": "download",
  "tag.fill": "label",
  "person.2.fill": "people",
  "gearshape.fill": "settings",
  // Player controls
  "play.fill": "play-arrow",
  "pause.fill": "pause",
  "forward.fill": "skip-next",
  "backward.fill": "skip-previous",
  "speaker.wave.2.fill": "volume-up",
  "speaker.slash.fill": "volume-off",
  "shuffle": "shuffle",
  "repeat": "repeat",
  "repeat.1": "repeat-one",
  "heart.fill": "favorite",
  "heart": "favorite-border",
  // Files
  "folder.fill": "folder",
  "doc.fill": "description",
  "music.note": "music-note",
  "waveform": "graphic-eq",
  // Actions
  "plus": "add",
  "plus.circle.fill": "add-circle",
  "minus": "remove",
  "trash.fill": "delete",
  "pencil": "edit",
  "magnifyingglass": "search",
  "xmark": "close",
  "xmark.circle.fill": "cancel",
  "checkmark": "check",
  "checkmark.circle.fill": "check-circle",
  "arrow.clockwise": "refresh",
  "arrow.up.arrow.down": "swap-vert",
  "ellipsis": "more-horiz",
  "ellipsis.circle": "more-vert",
  "square.and.arrow.up": "share",
  "square.and.arrow.down": "save-alt",
  "info.circle": "info",
  "exclamationmark.triangle.fill": "warning",
  "wifi": "wifi",
  "wifi.slash": "wifi-off",
  "link": "link",
  "key.fill": "vpn-key",
  "paintbrush.fill": "palette",
  "moon.fill": "dark-mode",
  "sun.max.fill": "light-mode",
  "list.bullet": "list",
  "square.grid.2x2": "grid-view",
  "clock": "schedule",
  "arrow.down.to.line": "download-for-offline",
  "stop.fill": "stop",
  "bolt.fill": "bolt",
  "star.fill": "star",
  "star": "star-border",
  "antenna.radiowaves.left.and.right": "cell-tower",
} as IconMapping;

export function IconSymbol({
  name,
  size = 24,
  color,
  style,
}: {
  name: IconSymbolName;
  size?: number;
  color: string | OpaqueColorValue;
  style?: StyleProp<TextStyle>;
  weight?: SymbolWeight;
}) {
  const iconName = MAPPING[name] ?? "help-outline";
  return <MaterialIcons color={color} size={size} name={iconName} style={style} />;
}
