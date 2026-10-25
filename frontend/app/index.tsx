import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, pct } from "@/src/format";
import { Logo } from "@/src/components/Logo";
import { Btn } from "@/src/components/Btn";
import { PitchFooter } from "@/src/components/Footer";
import { Sparkline } from "@/src/components/Sparkline";

const STEPS = [
  ["Customer adds a rain refund.", "Priced from the live chance of rain."],
  ["We hedge it on Kalshi.", "Contracts pay $1 each if it rains."],
  ["Rain? Refunds go out.", "Same official station data, automatically."],
];

type Ticker = { date: string; label: string; listed: boolean; cities: { city: string; p: number | null; change: number | null; history: number[] }[] };

export default function Landing() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const ticker = useQuery({ queryKey: ["ticker"], queryFn: () => api<Ticker>("/ticker"), refetchInterval: 3000 });

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: 16 }} showsVerticalScrollIndicator={false}>
        <View style={styles.pad} testID="landing-hero">
          <View style={styles.brandRow}>
            <Logo size={24} color={colors.brandPrimary} />
            <Text style={styles.brand}>Rainly</Text>
          </View>
          <Animated.Text entering={FadeInDown.duration(500)} style={styles.h1}>
            Rain shouldn&apos;t cost you customers.
          </Animated.Text>
          <Animated.Text entering={FadeInDown.delay(100).duration(500)} style={styles.lead}>
            Sell a rain refund at checkout. It&apos;s priced from live Kalshi odds and hedged automatically.
          </Animated.Text>
        </View>

        <View style={[styles.pad, styles.sectionHead]}>
          <Text style={styles.label}>
            Rain odds{ticker.data ? ` · ${ticker.data.label}` : ""}
          </Text>
          <View style={styles.live}>
            <View style={styles.dot} />
            <Text style={styles.label}>Live</Text>
          </View>
        </View>
        <View style={styles.pad} testID="live-odds-ticker">
          {ticker.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginVertical: 24 }} /> : null}
          {ticker.isError ? <Text style={styles.muted}>Live odds unavailable right now.</Text> : null}
          {ticker.data?.cities.map((c, i) => {
            const slug = c.city.replace(/\s/g, "-").toLowerCase();
            const up = (c.change ?? 0) > 0;
            return (
              <Animated.View
                key={c.city}
                entering={FadeIn.delay(i * 60)}
                style={[styles.oddsRow, i > 0 && styles.divider]}
                testID={`ticker-${slug}`}
              >
                <Text style={styles.city} numberOfLines={1}>
                  {c.city}
                </Text>
                <View style={styles.spark}>
                  <Sparkline data={c.history || []} color={colors.brandPrimary} height={20} testID={`ticker-sparkline-${slug}`} />
                </View>
                <Text style={styles.oddsP}>{c.p === null ? "—" : pct(c.p)}</Text>
                <View style={styles.deltaCell}>
                  {c.change ? (
                    <Text style={[styles.delta, { color: up ? colors.successText : colors.error }]} testID={`ticker-change-${slug}`}>
                      {up ? "▲" : "▼"} {Math.abs(c.change)}
                    </Text>
                  ) : (
                    <Text style={[styles.delta, { color: colors.muted }]}>–</Text>
                  )}
                </View>
              </Animated.View>
            );
          })}
        </View>

        <View style={[styles.pad, styles.sectionHead]}>
          <Text style={styles.label}>How it works</Text>
        </View>
        <View style={styles.pad}>
          {STEPS.map(([title, body], i) => (
            <View key={title} style={[styles.stepRow, i > 0 && styles.divider]} testID={`how-step-${i + 1}`}>
              <Text style={styles.stepNum}>{i + 1}</Text>
              <Text style={styles.stepText}>
                <Text style={styles.stepTitle}>{title} </Text>
                {body}
              </Text>
            </View>
          ))}
        </View>

        <PitchFooter />
      </ScrollView>
      <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
        <Btn testID="landing-get-started-button" label="Get started" onPress={() => router.push("/merchants")} />
      </View>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  pad: { paddingHorizontal: 24 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { fontFamily: fonts.display, fontSize: 20, color: c.onSurface, letterSpacing: -0.3 },
  h1: { fontFamily: fonts.display, fontSize: 42, lineHeight: 46, color: c.onSurface, letterSpacing: -1.2, marginTop: 40 },
  lead: { fontFamily: fonts.body, fontSize: 17, lineHeight: 25, color: c.onSurfaceSecondary, marginTop: 14 },
  sectionHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 40, marginBottom: 4 },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  live: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.success },
  muted: { fontFamily: fonts.body, color: c.muted, fontSize: 14, marginVertical: 16 },
  oddsRow: { flexDirection: "row", alignItems: "center", minHeight: 56, gap: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  city: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  spark: { width: 56 },
  oddsP: { width: 52, textAlign: "right", fontFamily: fonts.display, fontSize: 20, color: c.onSurface },
  deltaCell: { width: 40, alignItems: "flex-end" },
  delta: { fontFamily: fonts.displayMd, fontSize: 12 },
  stepRow: { flexDirection: "row", gap: 16, paddingVertical: 14 },
  stepNum: { width: 16, fontFamily: fonts.display, fontSize: 16, color: c.brandPrimary },
  stepText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary },
  stepTitle: { fontFamily: fonts.bodyBold, color: c.onSurface },
  cta: { paddingHorizontal: 24, paddingTop: 12, backgroundColor: c.surface },
}));
