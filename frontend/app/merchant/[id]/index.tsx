import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant, Quote } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { BUSINESS_LABELS, fonts, money, niceDate, pct } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { PitchFooter } from "@/src/components/Footer";
import { Disclosure } from "@/src/components/Disclosure";

type PnL = { premiums: number; hedge_cost: number; refunds: number; payout: number; net: number };
type Order = { id: string; ticker: string; count: number; price: number; fee: number; mode: string; status: string; note?: string; created_at: string };
type Booking = { id: string; customer_name: string; booking_value: number; kind: string; date: string; status: string };
type Dash = {
  merchant: Merchant & { brand?: string };
  brand_locations: number;
  mode: string;
  stats: { guarantees_sold: number; active: number; refunded: number; expired: number; refund_emails_sent: number; with_email: number; contracts_held: number; hedge_cost: number; premiums: number; refund_liability: number };
  pnl: { if_rains: PnL; if_dry: PnL };
  live: Quote;
  orderbook: { asks: [number, number][]; bids: [number, number][] };
  orders: Order[];
  recent_guarantees: Booking[];
};

const MODE_LABEL: Record<string, string> = { mock: "Simulated", kalshi_live: "Real orders on Kalshi", kalshi_demo: "Kalshi demo" };

function signed(n: number) {
  return `${n >= 0 ? "+" : ""}${money(n)}`;
}

export default function Dashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const narrow = useWindowDimensions().width < 360;
  const q = useQuery({ queryKey: ["dash", id], queryFn: () => api<Dash>(`/merchants/${id}/dashboard`), refetchInterval: 5000 });
  const d = q.data;

  if (q.isLoading) {
    return (
      <View style={styles.root}>
        <Header title="Dashboard" fallback="/merchants" />
        <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 60 }} />
      </View>
    );
  }
  if (q.isError || !d) {
    return (
      <View style={styles.root}>
        <Header title="Dashboard" fallback="/merchants" />
        <View style={{ padding: 20, gap: 12 }} testID="dashboard-error">
          <Text style={styles.body}>Couldn&apos;t load the dashboard.</Text>
          <Btn testID="dashboard-retry-button" label="Retry" variant="secondary" onPress={() => q.refetch()} />
        </View>
      </View>
    );
  }

  const live = d.live;
  const maxSize = Math.max(1, ...d.orderbook.asks.map((a) => a[1]));
  const limit = (live.yes_ask || 0) + 0.03 + 1e-9;
  const same = d.stats.active > 0 && Math.abs(d.pnl.if_rains.net - d.pnl.if_dry.net) < 1;
  const earn = Math.min(d.pnl.if_rains.net, d.pnl.if_dry.net);
  const bookings = d.recent_guarantees || [];

  return (
    <View style={styles.root}>
      <Header
        title={d.merchant.name}
        subtitle={`${BUSINESS_LABELS[d.merchant.business_type]} · ${d.merchant.city}`}
        fallback="/merchants"
        right={
          <Text style={[styles.badgeText, { color: d.mode === "mock" ? colors.warningText : colors.successText }]} testID="trading-mode-badge">
            {MODE_LABEL[d.mode] || d.mode}
          </Text>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 16 }} refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}>
        <View style={styles.pad}>
          <Animated.View entering={FadeInDown} style={{ paddingTop: 8 }}>
            <Text style={styles.weather} testID="weekend-rain-line">
              {d.merchant.city} this weekend:{" "}
              <Text style={styles.weatherStrong}>{live.yes_ask !== undefined ? `${pct(live.yes_ask)} chance of rain` : "odds not available"}</Text>
            </Text>

            <View style={styles.split}>
              <Cell label="Bookings covered" value={String(d.stats.guarantees_sold)} testID="metric-bookings-covered" />
              <View style={styles.vline} />
              <Cell label="You earn" value={d.stats.active > 0 ? signed(earn) : money(0)} testID="metric-you-earn" />
            </View>
            <Text style={styles.sub} testID="earn-explainer">
              {d.stats.active === 0
                ? "No open bookings yet. Share your checkout to cover your first customer."
                : same
                  ? "Whether it rains or not. Kalshi pays the refunds."
                  : `At least this much. ${signed(d.pnl.if_dry.net)} if it's dry, ${signed(d.pnl.if_rains.net)} if it rains.`}
            </Text>
          </Animated.View>

          <Btn
            testID="open-checkout-button"
            label="Open customer checkout"
            icon="phone-portrait-outline"
            onPress={() => router.push(`/merchant/${id}/checkout`)}
            style={{ marginTop: 16 }}
          />

          <Text style={[styles.label, styles.sectionGap]}>Customers covered</Text>
          <View testID="customers-covered-list">
            {bookings.length === 0 ? <Text style={styles.caption}>No customers yet.</Text> : null}
            {bookings.slice(0, 5).map((b, i) => (
              <BookingRow key={b.id} b={b} i={i} />
            ))}
            {bookings.length > 5 ? (
              <Disclosure label={`Show ${bookings.length - 5} more`} testID="customers-show-all">
                {bookings.slice(5).map((b, i) => (
                  <BookingRow key={b.id} b={b} i={i + 5} />
                ))}
              </Disclosure>
            ) : null}
          </View>

          <View style={[styles.list, { marginTop: 16 }]}>
            <Pressable testID="open-replay-button" onPress={() => router.push(`/merchant/${id}/replay`)} style={({ pressed }) => [styles.actionRow, pressed && { opacity: 0.6 }]}>
              <Ionicons name="rainy-outline" size={20} color={colors.brandPrimary} />
              <View style={{ flex: 1 }}>
                <Text style={styles.actionTitle}>See a real rainy day</Text>
                <Text style={styles.caption}>How refunds played out on a past rainy day</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          </View>

          <View style={{ marginTop: 16 }}>
            <Disclosure label="How it's hedged on Kalshi" testID="hedge-details-toggle">
              <View style={{ gap: 16 }} testID="hedge-details">
                <View style={styles.mathBox}>
                  <Line k="Refund fees collected" v={money(d.stats.premiums)} />
                  <Line k="Hedge cost (contracts + fees)" v={`−${money(d.stats.hedge_cost)}`} />
                  <Line k="If it rains: refunds paid" v={`−${money(d.pnl.if_rains.refunds)}`} />
                  <Line k="If it rains: Kalshi pays out" v={`+${money(d.pnl.if_rains.payout)}`} />
                  <Line k="Contracts held" v={d.stats.contracts_held.toLocaleString()} />
                  <Line k={`Refund price on ${money(d.merchant.avg_booking, 0)} this weekend`} v={live.available ? money(live.price) : live.reason || "—"} />
                  {d.stats.refunded + d.stats.expired > 0 ? (
                    <Text style={styles.caption} testID="settled-summary">
                      Settled: {d.stats.refunded} refunded · {d.stats.expired} dry · {d.stats.refund_emails_sent} refund emails sent
                    </Text>
                  ) : null}
                </View>

                {live.rules_primary ? (
                  <View>
                    <Text style={styles.label}>Official rain rule</Text>
                    <Text style={styles.triggerText} testID="live-trigger-text">{live.rules_primary}</Text>
                  </View>
                ) : null}

                <View testID="orderbook">
                  <Text style={styles.label}>Order book · {live.ticker || live.event_ticker}</Text>
                  {d.orderbook.asks.length === 0 ? <Text style={styles.caption}>No asks on the book.</Text> : null}
                  {d.orderbook.asks.slice(0, 5).map(([price, size], i) => (
                    <View key={`${price}-${i}`} style={styles.bookRow} testID={`orderbook-ask-${i}`}>
                      <View style={[styles.bookBar, { width: `${(size / maxSize) * 100}%`, backgroundColor: price <= limit ? colors.brandSecondary : colors.surfaceSecondary }]} />
                      <Text style={styles.bookPrice}>{Math.round(price * 100)}¢</Text>
                      <Text style={styles.bookSize}>{Math.round(size).toLocaleString()}</Text>
                    </View>
                  ))}
                </View>

                <View testID="hedge-order-log">
                  <Text style={styles.label}>Hedge orders · {d.orders.length}</Text>
                  {d.orders.length === 0 ? <Text style={styles.caption}>No hedge orders yet.</Text> : null}
                  {d.orders.slice(0, 10).map((o, i) => (
                    <OrderRow key={o.id} o={o} i={i} />
                  ))}
                </View>
              </View>
            </Disclosure>
          </View>
        </View>
        <PitchFooter />
      </ScrollView>
    </View>
  );

  function BookingRow({ b, i }: { b: Booking; i: number }) {
    const status = b.status === "refunded" ? `Refunded ${money(b.booking_value, 0)}` : b.status === "expired" ? "Stayed dry" : "Covered";
    const color = b.status === "refunded" ? colors.brandPrimary : b.status === "expired" ? colors.muted : colors.successText;
    return (
      <View style={[styles.orderRow, i > 0 && styles.divider]} testID={`customer-row-${i}`}>
        <View style={{ flex: 1 }}>
          <Text style={styles.orderMain} numberOfLines={1}>
            {b.customer_name}
          </Text>
          <Text style={styles.caption}>
            {b.kind === "weekend" ? `Weekend of ${niceDate(b.date)}` : niceDate(b.date)} · {money(b.booking_value, 0)} booking
          </Text>
        </View>
        <Text style={[styles.status, { color }]} testID={`customer-status-${i}`}>
          {status}
        </Text>
      </View>
    );
  }

  function OrderRow({ o, i }: { o: Order; i: number }) {
    return (
      <View style={[styles.orderRow, i > 0 && styles.divider]} testID={`order-row-${i}`}>
        <Text style={[styles.orderMain, { flex: 1 }]}>
          {o.count} contracts @ {Math.round(o.price * 100)}¢
          {o.mode === "kalshi_demo" ? <Text style={[styles.demoTag, o.status.startsWith("canceled") && { color: colors.error }]}>{`  Kalshi demo · ${o.status}`}</Text> : null}
          {o.mode === "kalshi_live" ? <Text style={styles.demoTag}>{`  Live · ${o.status}`}</Text> : null}
        </Text>
        <Text style={styles.orderMain}>{money(o.count * o.price + o.fee)}</Text>
      </View>
    );
  }

  function Cell({ label, value, testID }: { label: string; value: string; testID: string }) {
    return (
      <View style={styles.cell} testID={testID}>
        <Text style={styles.cellLabel}>{label}</Text>
        <Text style={[styles.cellValue, narrow && { fontSize: value.length > 7 ? 22 : 26 }]} numberOfLines={1}>
          {value}
        </Text>
      </View>
    );
  }

  function Line({ k, v }: { k: string; v: string }) {
    return (
      <View style={styles.rowBetween}>
        <Text style={styles.lineK}>{k}</Text>
        <Text style={styles.lineV}>{v}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  pad: { paddingHorizontal: 24, paddingTop: 16, gap: 8 },
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  weather: { fontFamily: fonts.body, fontSize: 16, color: c.onSurfaceSecondary },
  weatherStrong: { fontFamily: fonts.bodyBold, color: c.onSurface },
  sub: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary, marginTop: 10 },
  sectionGap: { marginTop: 32 },
  split: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingVertical: 16, marginTop: 16 },
  vline: { width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 16 },
  cell: { flex: 1, gap: 4 },
  cellLabel: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  cellValue: { fontFamily: fonts.display, fontSize: 36, letterSpacing: -1, color: c.onSurface },
  list: { borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64 },
  actionTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  caption: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  body: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  triggerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.onSurfaceTertiary },
  bookRow: { height: 32, justifyContent: "center", flexDirection: "row", alignItems: "center", paddingHorizontal: 8, overflow: "hidden", borderRadius: 6 },
  bookBar: { position: "absolute", left: 0, top: 2, bottom: 2, borderRadius: 6 },
  bookPrice: { fontFamily: fonts.display, fontSize: 14, color: c.onSurface, width: 48 },
  bookSize: { flex: 1, textAlign: "right", fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurfaceSecondary },
  orderRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12, minHeight: 56 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  orderMain: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurface },
  status: { fontFamily: fonts.bodyBold, fontSize: 13 },
  demoTag: { fontFamily: fonts.bodySemi, fontSize: 11, color: c.successText },
  lineK: { flex: 1, fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceSecondary },
  lineV: { fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurface, flexShrink: 1, textAlign: "right" },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  mathBox: { padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, gap: 6 },
}));
