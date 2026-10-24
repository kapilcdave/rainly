import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
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

const HERO = "https://images.unsplash.com/photo-1571535366901-3244028cba2d?crop=entropy&cs=srgb&fm=jpg&q=85&w=1200";

const STEPS = [
  { icon: "storefront-outline", title: "Offer it at checkout", body: "Customers add a small rain refund to their booking. Priced live from Kalshi rain odds." },
  { icon: "swap-horizontal-outline", title: "We hedge instantly", body: "Rainly buys matching Kalshi YES contracts — each pays $1 if it rains." },
  { icon: "umbrella-outline", title: "Rain? Auto refund", body: "When the official station records rain, the market settles YES and refunds go out." },
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
        <View style={styles.hero} testID="landing-hero">
          <Image source={{ uri: HERO }} style={StyleSheetAbs} contentFit="cover" transition={300} />
          <LinearGradient colors={["rgba(11,30,63,0.55)", "rgba(11,30,63,0.92)"]} style={StyleSheetAbs} />
          <View style={[styles.heroInner, { paddingTop: insets.top + 16 }]}>
            <View style={styles.brandRow}>
              <View style={styles.logoTile}>
                <Logo size={26} color={colors.brandPrimary} />
              </View>
              <Text style={styles.brand}>Rainly</Text>
            </View>
            <Animated.Text entering={FadeInDown.duration(500)} style={styles.h1}>
              Rain shouldn&apos;t cost you customers
            </Animated.Text>
            <Animated.Text entering={FadeInDown.delay(120).duration(500)} style={styles.lead}>
              Offer a rain refund at checkout. Priced live from Kalshi rain markets, hedged automatically, paid out on
              official station data.
            </Animated.Text>
          </View>
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

        <View style={[styles.section, styles.basis]} testID="no-basis-risk-card">
          <Ionicons name="git-compare-outline" size={22} color={colors.onSurfaceTertiary} />
          <Text style={styles.basisText}>
            <Text style={{ fontFamily: fonts.bodyBold }}>Zero basis risk. </Text>
            Refunds trigger on the same official station reading the Kalshi contract settles on — the hedge pays exactly
            when refunds are owed.
          </Text>
        </View>

        <PitchFooter />
      </ScrollView>
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <Btn testID="landing-open-demo-button" label="Open merchant demo" icon="arrow-forward" onPress={() => router.push("/merchants")} />
      </View>
    </View>
  );
}

const StyleSheetAbs = { position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0 };

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  hero: { minHeight: 380, overflow: "hidden", backgroundColor: c.hero, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  heroInner: { paddingHorizontal: 20, paddingBottom: 32, flex: 1, justifyContent: "space-between", minHeight: 380 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  logoTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  brand: { fontFamily: fonts.display, fontSize: 24, color: c.onHero, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.display, fontSize: 40, lineHeight: 44, color: c.onHero, letterSpacing: -1, marginTop: 48 },
  lead: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.heroMuted, marginTop: 12 },
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
  basis: { flexDirection: "row", gap: 12, padding: 16, marginHorizontal: 20, paddingHorizontal: 16, borderRadius: 16, backgroundColor: c.brandSecondary },
  basisText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceTertiary },
  cta: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
}));
