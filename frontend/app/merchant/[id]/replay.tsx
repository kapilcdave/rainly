import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, money, niceDate, pct } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";

type Item = { ticker: string; date: string; result: "yes" | "no" };
type Detail = {
  ticker: string; city: string; date: string; result: string; rules_primary: string; precip_inches: string;
  entry_p: number; entry_source: string; would_offer: boolean; bookings: number; booking_value: number; price_each: number;
  contracts: number; premiums: number; hedge_cost: number; refunds: number; payout: number; net: number;
};

export default function Replay() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();

  const merchant = useQuery({ queryKey: ["merchant", id], queryFn: () => api<Merchant>(`/merchants/${id}`) });
  const city = merchant.data?.city;
  const list = useQuery({ queryKey: ["replay", city], enabled: !!city, queryFn: () => api<{ items: Item[]; recommended: Partial<Record<"yes" | "no", string>> }>(`/replay?city=${encodeURIComponent(city!)}`) });

  const [result, setResult] = useState<"yes" | "no">("yes");
  const [ticker, setTicker] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [run, setRun] = useState(0);
  const chipScroll = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, number>>({});
  const scrollToChip = (t: string | null) => {
    const x = t ? chipX.current[t] : undefined;
    if (x !== undefined) chipScroll.current?.scrollTo({ x: Math.max(0, x - 16), animated: true });
  };
  useEffect(() => scrollToChip(ticker), [ticker]);

  const items = useMemo(() => (list.data?.items || []).filter((i) => i.result === result), [list.data, result]);
  useEffect(() => {
    setTicker(list.data?.recommended?.[result] ?? items[0]?.ticker ?? null);
  }, [items, list.data, result]);

  const bookings = 40;
  const detail = useQuery({
    queryKey: ["replay-detail", ticker, merchant.data?.avg_booking, merchant.data?.margin_pct],
    enabled: !!ticker && !!merchant.data,
    queryFn: () => api<Detail>(`/replay/detail?ticker=${ticker}&bookings=${bookings}&booking_value=${merchant.data!.avg_booking}&margin_pct=${merchant.data!.margin_pct}`),
  });

  useEffect(() => {
    if (!detail.data) return;
    setStep(0);
    const ts = [1, 2, 3, 4].map((s) => setTimeout(() => setStep(s), s * 900));
    return () => ts.forEach(clearTimeout);
  }, [detail.data, run]);

  const d = detail.data;
  const rained = d?.result === "yes";
  const steps = d
    ? [
        {
          icon: rained ? "rainy" : "sunny",
          title: `Market settled ${d.result.toUpperCase()}`,
          big: `${d.precip_inches}" rain`,
          body: `${d.ticker} · official station reading`,
        },
        {
          icon: "people",
          title: rained ? `${d.bookings} refunds issued` : "No refunds owed",
          big: rained ? money(d.refunds, 0) : "$0",
          body: rained ? `${d.bookings} × ${money(d.booking_value, 0)} back to customers, automatically` : "Customers enjoyed a dry day",
        },
        {
          icon: "cash",
          title: rained ? "Hedge paid out" : "Contracts expired",
          big: rained ? `+${money(d.payout, 0)}` : "$0",
          body: rained ? `${d.contracts.toLocaleString()} YES contracts × $1` : `${d.contracts.toLocaleString()} YES contracts expire worthless`,
        },
      ]
    : [];

  return (
    <View style={styles.root}>
      <Header title="Settlement replay" subtitle={city ? `${city} · past daily markets` : undefined} fallback={`/merchant/${id}`} />
      <View style={styles.sticky}>
        <View style={styles.seg}>
          {(["yes", "no"] as const).map((r) => (
            <Pressable key={r} testID={`replay-filter-${r}`} onPress={() => setResult(r)} style={[styles.segOpt, result === r && styles.segOn]}>
              <Ionicons name={r === "yes" ? "rainy-outline" : "sunny-outline"} size={16} color={result === r ? colors.onBrandPrimary : colors.onSurfaceSecondary} />
              <Text style={[styles.segText, result === r && { color: colors.onBrandPrimary }]}>{r === "yes" ? "It rained (YES)" : "Stayed dry (NO)"}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView ref={chipScroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow} style={{ height: 56, flexGrow: 0 }}>
          {list.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : null}
          {!list.isLoading && items.length === 0 ? <Text style={styles.caption}>No settled dates found</Text> : null}
          {items.map((i) => (
            <Pressable key={i.ticker} testID={`replay-date-${i.date}`} onLayout={(e) => { chipX.current[i.ticker] = e.nativeEvent.layout.x; if (i.ticker === ticker) scrollToChip(i.ticker); }} onPress={() => setTicker(i.ticker)} style={[styles.chip, ticker === i.ticker && styles.chipOn]}>
              <Text style={[styles.chipText, ticker === i.ticker && { color: colors.onBrandSecondary }]}>{niceDate(i.date)}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 16, paddingBottom: insets.bottom + 24, gap: 0 }}>
        {detail.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
        {detail.isError ? <Text style={styles.caption}>Failed to load replay data.</Text> : null}
        {d ? (
          <>
            <View style={styles.setup} testID="replay-setup">
              <Text style={styles.setupText}>
                {d.bookings} bookings × {money(d.booking_value, 0)} · <Text style={{ fontFamily: fonts.bodyBold }}>{pct(d.entry_p)}</Text> rain chance at listing
              </Text>
              {!d.would_offer ? (
                <Text style={[styles.caption, { color: colors.warningText }]} testID="replay-not-offered-note">
                  Above the 60% cap — Rainly wouldn&apos;t have sold refunds this day.
                </Text>
              ) : null}
            </View>

            {steps.map((s, i) => {
              const done = step > i;
              const good = i === 2 && rained;
              return (
                <View key={`${run}-${d.ticker}-${i}`} style={[styles.step, done && (good ? styles.stepGood : styles.stepDone)]} testID={`replay-step-${i + 1}`}>
                  <View style={[styles.stepIcon, done && { backgroundColor: good ? colors.success : colors.brandPrimary }]}>
                    <Ionicons name={s.icon as any} size={20} color={done ? colors.onBrandPrimary : colors.muted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.stepTitle, !done && { color: colors.muted }]}>{s.title}</Text>
                    {done ? (
                      <Animated.View entering={FadeInUp.duration(400)}>
                        <Text style={[styles.stepBig, good && { color: colors.successText }]}>{s.big}</Text>
                        <Text style={styles.caption}>{s.body}</Text>
                      </Animated.View>
                    ) : (
                      <Text style={styles.caption}>Pending…</Text>
                    )}
                  </View>
                </View>
              );
            })}

            {step >= 4 ? (
              <Animated.View entering={FadeInUp} style={styles.net} testID="replay-net-result">
                <Text style={styles.netLabel}>Merchant net</Text>
                <Text style={[styles.netBig, { color: d.net >= 0 ? colors.successText : colors.error }]}>
                  {d.net >= 0 ? "+" : ""}
                  {money(d.net)}
                </Text>
                <Text style={styles.caption}>
                  Fees {money(d.premiums)} − hedge {money(d.hedge_cost)}
                  {rained ? ` − refunds ${money(d.refunds)} + payout ${money(d.payout)}` : ""}
                </Text>
              </Animated.View>
            ) : null}

            <Btn testID="replay-run-again-button" label="Replay animation" icon="refresh" variant="secondary" onPress={() => setRun((r) => r + 1)} style={{ marginTop: 20 }} />
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  sticky: { backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border, paddingTop: 12 },
  seg: { flexDirection: "row", gap: 8, paddingHorizontal: 24 },
  segOpt: { flex: 1, height: 40, borderRadius: 999, flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  segOn: { backgroundColor: c.onSurface },
  segText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceSecondary },
  chipRow: { gap: 8, paddingHorizontal: 24, alignItems: "center" },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandSecondary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceSecondary },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: c.muted },
  setup: { gap: 4, paddingBottom: 8 },
  setupText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: c.onSurfaceSecondary },
  step: { flexDirection: "row", gap: 14, paddingVertical: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  stepDone: {},
  stepGood: {},
  stepIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceSecondary },
  stepTitle: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurfaceSecondary },
  stepBig: { fontFamily: fonts.display, fontSize: 30, color: c.onSurface, marginTop: 2 },
  net: { paddingVertical: 20, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  netLabel: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  netBig: { fontFamily: fonts.display, fontSize: 48, letterSpacing: -1.5 },
}));
