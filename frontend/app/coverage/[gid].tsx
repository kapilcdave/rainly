import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn } from "react-native-reanimated";

import { api } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, money, niceDate, pct } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { Disclosure } from "@/src/components/Disclosure";

type Coverage = {
  id: string; merchant_name: string; city: string; kind: string; date: string; covers_until: string;
  booking_value: number; price: number; status: "active" | "refunded" | "expired"; customer_name: string;
  rain_chance: number | null; market_status: string; result: string | null; rules_primary: string;
  settled_at: string | null; refund_email_sent: boolean;
};

export default function CoverageScreen() {
  const { gid } = useLocalSearchParams<{ gid: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["coverage", gid], queryFn: () => api<Coverage>(`/guarantees/${gid}`), refetchInterval: 30000, retry: 1 });
  const c = q.data;
  const when = c ? (c.kind === "weekend" ? `${niceDate(c.date)} – ${niceDate(c.covers_until)}` : niceDate(c.date)) : "";

  const headline =
    c?.status === "refunded" ? "It rained. You're refunded." : c?.status === "expired" ? "It stayed dry." : "You're covered.";
  const sub =
    c?.status === "refunded"
      ? `${money(c.booking_value)} is on its way back to you${c.refund_email_sent ? " — we've emailed you the details" : ""}.`
      : c?.status === "expired"
        ? "No rain was recorded, so the refund didn't trigger. Hope you enjoyed it!"
        : c
          ? `If it rains on ${when}, you get ${money(c.booking_value)} back automatically. No claim needed.`
          : "";

  return (
    <View style={styles.root}>
      <Header title="My rain refund" subtitle={c?.merchant_name} fallback="/" />
      {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
      {q.isError ? (
        <View style={{ padding: 24, gap: 12 }} testID="coverage-error">
          <Text style={styles.sub}>We couldn&apos;t find this booking.</Text>
          <Btn testID="coverage-retry-button" label="Retry" variant="secondary" onPress={() => q.refetch()} />
        </View>
      ) : null}
      {c ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: insets.bottom + 24 }}>
          <Animated.View entering={FadeIn}>
            <Text style={styles.label} testID="coverage-status">
              {c.status === "active" ? "Active" : c.status === "refunded" ? "Refunded" : "Ended"}
            </Text>
            <Text style={styles.h1} testID="coverage-headline">
              {headline}
            </Text>
            <Text style={styles.sub}>{sub}</Text>
          </Animated.View>

          <View style={styles.split}>
            <View style={styles.cell} testID="coverage-amount">
              <Text style={styles.cellLabel}>{c.status === "refunded" ? "Refunded" : "Refund if it rains"}</Text>
              <Text style={styles.cellValue}>{money(c.booking_value)}</Text>
            </View>
            <View style={styles.vline} />
            <View style={styles.cell} testID="coverage-rain-chance">
              <Text style={styles.cellLabel}>{c.status === "active" ? "Chance of rain now" : "Result"}</Text>
              <Text style={styles.cellValue}>
                {c.status === "active" ? (c.rain_chance !== null ? pct(c.rain_chance) : "—") : c.result === "yes" ? "Rain" : "Dry"}
              </Text>
            </View>
          </View>

          <View style={styles.rows}>
            <Row k="Where" v={`${c.merchant_name}, ${c.city}`} />
            <Row k="Covered dates" v={when} testID="coverage-dates" />
            <Row k="You paid" v={money(c.price)} />
            <Row
              k="When it pays out"
              v={c.status === "active" ? "Automatically, once the official station records rain" : c.settled_at ? niceDate(c.settled_at.slice(0, 10)) : "—"}
              testID="coverage-payout-when"
            />
          </View>

          {c.rules_primary ? (
            <Disclosure label="Official trigger" testID="coverage-trigger-toggle">
              <Text style={styles.trigger}>{c.rules_primary}</Text>
            </Disclosure>
          ) : null}
        </ScrollView>
      ) : null}
    </View>
  );

  function Row({ k, v, testID }: { k: string; v: string; testID?: string }) {
    return (
      <View style={styles.row} testID={testID}>
        <Text style={styles.rowK}>{k}</Text>
        <Text style={styles.rowV}>{v}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.brandPrimary, textTransform: "uppercase", letterSpacing: 0.8 },
  h1: { fontFamily: fonts.display, fontSize: 36, lineHeight: 40, letterSpacing: -1, color: c.onSurface, marginTop: 8 },
  sub: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: c.onSurfaceSecondary, marginTop: 10 },
  split: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingVertical: 14, marginTop: 28 },
  vline: { width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 16 },
  cell: { flex: 1, gap: 4 },
  cellLabel: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  cellValue: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  rows: { marginTop: 8 },
  row: { flexDirection: "row", gap: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.border },
  rowK: { width: 120, fontFamily: fonts.body, fontSize: 14, color: c.muted },
  rowV: { flex: 1, fontFamily: fonts.bodySemi, fontSize: 14, lineHeight: 20, color: c.onSurface },
  trigger: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.onSurfaceSecondary },
}));
