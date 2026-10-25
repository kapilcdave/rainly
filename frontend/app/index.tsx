import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, niceDate, pct } from "@/src/format";
import { Logo } from "@/src/components/Logo";
import { Btn } from "@/src/components/Btn";
import { PitchFooter } from "@/src/components/Footer";

const STEPS = [
  { icon: "storefront-outline", title: "Offer it at checkout", body: "Customers add a small rain refund." },
  { icon: "swap-horizontal-outline", title: "We hedge instantly", body: "Matching Kalshi contracts pay $1 if it rains." },
  { icon: "umbrella-outline", title: "Rain? Auto refund", body: "Customers are refunded and emailed automatically." },
];

type Ticker = { weekend_of: string; listed: boolean; cities: { city: string; p: number | null }[] };

export default function Landing() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ticker = useQuery({ queryKey: ["ticker"], queryFn: () => api<Ticker>("/ticker"), refetchInterval: 20000 });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 24 }]} testID="landing-hero">
          <Animated.View entering={FadeInDown.duration(500)} style={styles.logoTile}>
            <Logo size={64} color={colors.brandPrimary} />
          </Animated.View>
          <Text style={styles.brand}>Rainthropic</Text>
          <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={styles.h1}>
            Rain shouldn&apos;t cost you customers
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(180).duration(500)} style={styles.lead}>
            Rain refunds at checkout, priced live from Kalshi.
          </Animated.Text>
        </View>

        <View style={styles.section}>
          <View style={styles.rowBetween}>
            <Text style={styles.h2}>Live rain odds</Text>
            <View style={styles.liveDot}>
              <View style={styles.dot} />
              <Text style={styles.liveText}>
                {ticker.data ? `Weekend of ${niceDate(ticker.data.weekend_of)}` : "Kalshi"}
              </Text>
            </View>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tickerRow}
          testID="live-odds-ticker"
        >
          {ticker.isLoading ? (
            <ActivityIndicator color={colors.brandPrimary} />
          ) : ticker.isError ? (
            <Text style={styles.muted}>Live odds unavailable</Text>
          ) : (
            ticker.data?.cities.map((c) => (
              <View key={c.city} style={styles.tickerCard} testID={`ticker-${c.city.replace(/\s/g, "-").toLowerCase()}`}>
                <Text style={styles.tickerCity} numberOfLines={1}>
                  {c.city}
                </Text>
                <Text style={styles.tickerP}>{c.p === null ? "—" : pct(c.p)}</Text>
                <Text style={styles.tickerSub}>chance of rain</Text>
              </View>
            ))
          )}
        </ScrollView>

        <View style={styles.section}>
          <Text style={styles.h2}>How it works</Text>
          <View style={{ gap: 12, marginTop: 12 }}>
            {STEPS.map((s, i) => (
              <Animated.View key={s.title} entering={FadeInDown.delay(150 + i * 90)} style={styles.step} testID={`how-step-${i + 1}`}>
                <View style={styles.stepNum}>
                  <Text style={styles.stepNumText}>{i + 1}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <View style={styles.stepTitleRow}>
                    <Ionicons name={s.icon as any} size={18} color={colors.brandPrimary} />
                    <Text style={styles.stepTitle}>{s.title}</Text>
                  </View>
                  <Text style={styles.stepBody}>{s.body}</Text>
                </View>
              </Animated.View>
            ))}
          </View>
        </View>

        <PitchFooter />
      </ScrollView>
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <Btn testID="landing-get-started-button" label="Get started" icon="arrow-forward" onPress={() => router.push("/merchants")} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { backgroundColor: c.brandPrimary, paddingHorizontal: 20, paddingBottom: 32, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  logoTile: { width: 88, height: 88, borderRadius: 24, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: fonts.display, fontSize: 28, color: c.onBrandPrimary, letterSpacing: -0.5, marginTop: 16 },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: c.onBrandPrimary, letterSpacing: -1, marginTop: 24 },
  lead: { fontFamily: fonts.body, fontSize: 17, lineHeight: 24, color: c.heroMuted, marginTop: 12 },
  section: { paddingHorizontal: 20, marginTop: 28 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  h2: { fontFamily: fonts.bodyBold, fontSize: 20, color: c.onSurface },
  liveDot: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.success },
  liveText: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted },
  muted: { fontFamily: fonts.body, color: c.muted, fontSize: 14 },
  tickerRow: { gap: 12, paddingHorizontal: 20, paddingTop: 12, minHeight: 100 },
  tickerCard: { flexShrink: 0, width: 128, padding: 14, borderRadius: 16, backgroundColor: c.surfaceTertiary },
  tickerCity: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceTertiary },
  tickerP: { fontFamily: fonts.display, fontSize: 32, color: c.brandPrimary, marginTop: 4 },
  tickerSub: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  step: { flexDirection: "row", gap: 14, padding: 16, borderRadius: 16, backgroundColor: c.surfaceSecondary },
  stepNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  stepNumText: { fontFamily: fonts.display, color: c.onBrandPrimary, fontSize: 16 },
  stepTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  stepTitle: { fontFamily: fonts.bodyBold, fontSize: 16, color: c.onSurface },
  stepBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary, marginTop: 4 },
  cta: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
