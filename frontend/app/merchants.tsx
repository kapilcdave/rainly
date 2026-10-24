import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { BUSINESS_ICONS, BUSINESS_LABELS, fonts, money } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { Logo } from "@/src/components/Logo";

export default function Merchants() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["merchants"], queryFn: () => api<Merchant[]>("/merchants") });

  return (
    <View style={styles.root}>
      <Header
        title="Pick a merchant"
        subtitle="Demo mode · no login needed"
        right={
          <View style={styles.logo}>
            <Logo size={24} color={colors.brandPrimary} />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 12 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
      >
        {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
        {q.isError ? (
          <View style={styles.error} testID="merchants-error">
            <Text style={styles.errorText}>Couldn&apos;t load merchants.</Text>
            <Btn testID="merchants-retry-button" label="Retry" variant="secondary" onPress={() => q.refetch()} />
          </View>
        ) : null}
        {q.data?.map((m, i) => (
          <Animated.View key={m.id} entering={FadeInDown.delay(i * 80)}>
            <Pressable
              testID={`merchant-card-${i}`}
              onPress={() => router.push(`/merchant/${m.id}`)}
              style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
            >
              <View style={styles.icon}>
                <Ionicons name={(BUSINESS_ICONS[m.business_type] || "storefront-outline") as any} size={22} color={colors.brandPrimary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name} numberOfLines={1}>
                  {m.name}
                </Text>
                <Text style={styles.meta}>
                  {BUSINESS_LABELS[m.business_type]} · {m.city} · avg {money(m.avg_booking, 0)}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.big}>{m.guarantees ?? 0}</Text>
                <Text style={styles.small}>guarantees</Text>
              </View>
            </Pressable>
          </Animated.View>
        ))}
        <Btn
          testID="add-business-button"
          label="Add your business"
          icon="add"
          variant="secondary"
          onPress={() => router.push("/onboarding")}
          style={{ marginTop: 12 }}
        />
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  logo: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 16, borderRadius: 20, backgroundColor: c.surfaceSecondary },
  icon: { width: 48, height: 48, borderRadius: 14, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  name: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.onSurface },
  meta: { fontFamily: fonts.body, fontSize: 13, color: c.muted, marginTop: 2 },
  big: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  small: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  error: { gap: 12, padding: 16, borderRadius: 16, backgroundColor: c.errorSoft },
  errorText: { fontFamily: fonts.bodySemi, color: c.error },
}));
