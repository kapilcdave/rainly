import { Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts } from "@/src/format";
import { ReactNode } from "react";

export function Header({ title, subtitle, right, fallback = "/" }: { title: string; subtitle?: string; right?: ReactNode; fallback?: string }) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { paddingTop: insets.top + 8 }]}>
      <Pressable
        testID="header-back-button"
        hitSlop={8}
        onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as any))}
        style={({ pressed }) => [styles.back, pressed && { opacity: 0.6 }]}
      >
        <Ionicons name="chevron-back" size={22} color={colors.onSurface} />
      </Pressable>
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1} testID="header-title">
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.sub} numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: c.surface,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  title: { fontFamily: fonts.bodyBold, fontSize: 17, color: c.onSurface },
  sub: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
}));
