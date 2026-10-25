import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInUp } from "react-native-reanimated";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, money } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";

type Week = { week_of: string; sold: number; fees: number; hedge_cost: number; refunds: number; payout: number; net: number };
type Report = { merchant: Merchant; weeks: Week[]; totals: Omit<Week, "week_of"> & { declined: number; attach_rate: number | null } };

const UPSELL_TIPS = [
  "Turn the rain refund on by default at checkout — most customers keep it.",
  "Put the printed table card at the host stand and on every table.",
  "Mention it when confirming weekend bookings, especially when rain is forecast.",
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (iso: string) => {
  const [, m, d] = iso.split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}`;
};

export default function RevenueReport() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const q = useQuery({ queryKey: ["report", id], queryFn: () => api<Report>(`/merchants/${id}/report?weeks=8`) });
  const r = q.data;
  const max = Math.max(1, ...(r?.weeks.map((w) => Math.abs(w.net)) ?? [1]));
  const latest = r?.weeks[r.weeks.length - 1];

  return (
    <View style={styles.root}>
      <Header title="Weekly earnings" subtitle={r?.merchant.name} fallback={`/merchant/${id}`} />
      {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
      {q.isError ? (
        <View style={{ padding: 24, gap: 12 }} testID="report-error">
          <Text style={styles.sub}>Couldn&apos;t load the report.</Text>
          <Btn testID="report-retry-button" label="Retry" variant="secondary" onPress={() => q.refetch()} />
        </View>
      ) : null}
      {r && latest ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 24 }}>
          <Text style={styles.label}>Last 8 weeks</Text>
          <Text style={[styles.bigNum, { color: r.totals.net >= 0 ? colors.onSurface : colors.error }]} testID="report-total-net">
            {r.totals.net >= 0 ? "+" : ""}
            {money(r.totals.net)}
          </Text>
          <Text style={styles.sub} testID="report-total-sold">
            {r.totals.sold} rain refunds sold · {money(r.totals.fees)} in fees
          </Text>

          <View style={styles.chart} testID="report-chart">
            {r.weeks.map((w, i) => {
              const h = Math.max(2, (Math.abs(w.net) / max) * 120);
              const isLatest = i === r.weeks.length - 1;
              return (
                <View key={w.week_of} style={styles.barCol} testID={`report-bar-${i}`}>
                  <Animated.View
                    entering={FadeInUp.delay(i * 50)}
                    style={[
                      styles.bar,
                      { height: h, backgroundColor: w.net < 0 ? colors.error : colors.brandPrimary, opacity: isLatest || w.sold === 0 ? 1 : 0.45 },
                      w.sold === 0 && { backgroundColor: colors.border },
                    ]}
                  />
                  <Text style={styles.barLabel}>{short(w.week_of)}</Text>
                </View>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 32 }]}>By week</Text>
          {[...r.weeks].reverse().map((w, i) => (
            <View key={w.week_of} style={[styles.row, i > 0 && styles.divider]} testID={`report-week-${w.week_of}`}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>Week of {short(w.week_of)}</Text>
                <Text style={styles.caption}>
                  {w.sold
                    ? `${w.sold} sold · fees ${money(w.fees)} · hedge ${money(w.hedge_cost)}${w.refunds ? ` · refunds ${money(w.refunds)} · payout ${money(w.payout)}` : ""}`
                    : "No refunds sold"}
                </Text>
              </View>
              <Text style={[styles.rowNet, { color: w.net < 0 ? colors.error : w.sold ? colors.onSurface : colors.muted }]}>
                {w.sold ? `${w.net >= 0 ? "+" : ""}${money(w.net)}` : "—"}
              </Text>
            </View>
          ))}

          <Text style={[styles.label, { marginTop: 32 }]}>Rain refund uptake</Text>
          <View style={styles.row} testID="report-attach-rate">
            <View style={{ flex: 1 }}>
              <Text style={styles.rowTitle}>
                {r.totals.attach_rate === null ? "No checkouts yet" : `${Math.round(r.totals.attach_rate * 100)}% of bookings added a refund`}
              </Text>
              <Text style={styles.caption}>
                {r.totals.sold} with a refund · {r.totals.declined} without
              </Text>
            </View>
          </View>
          <View style={styles.uptakeBar}>
            <View style={[styles.uptakeFill, { flex: r.totals.sold || 0 }]} />
            <View style={{ flex: r.totals.declined || (r.totals.sold ? 0 : 1) }} />
          </View>
          {UPSELL_TIPS.map((t, i) => (
            <View key={t} style={[styles.row, i === 0 ? { marginTop: 8 } : styles.divider]} testID={`report-upsell-tip-${i}`}>
              <Text style={styles.tipNum}>{i + 1}</Text>
              <Text style={[styles.caption, { flex: 1, fontSize: 14, lineHeight: 20, color: colors.onSurfaceSecondary, marginTop: 0 }]}>{t}</Text>
            </View>
          ))}

          <Text style={[styles.tip]} testID="report-tip">
            Tip: offer the rain refund on every booking, not just on cloudy days. Each one earns you{" "}
            {r.merchant.margin_pct}% margin and the hedge covers the payout.
          </Text>
        </ScrollView>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  bigNum: { fontFamily: fonts.display, fontSize: 56, letterSpacing: -2, marginTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary },
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 150, marginTop: 28 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 6 },
  bar: { width: "100%", borderRadius: 4 },
  barLabel: { fontFamily: fonts.body, fontSize: 10, color: c.muted },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurface },
  caption: { fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: c.muted, marginTop: 2 },
  rowNet: { fontFamily: fonts.display, fontSize: 18 },
  tip: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: c.onSurfaceSecondary, marginTop: 24 },
  uptakeBar: { flexDirection: "row", height: 8, borderRadius: 4, overflow: "hidden", backgroundColor: c.surfaceSecondary },
  uptakeFill: { backgroundColor: c.brandPrimary },
  tipNum: { width: 16, fontFamily: fonts.display, fontSize: 15, color: c.brandPrimary },
}));
