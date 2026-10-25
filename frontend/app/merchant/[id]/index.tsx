import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInDown } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant, Quote } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { BUSINESS_LABELS, fonts, money, pct } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { PitchFooter } from "@/src/components/Footer";
import { Disclosure } from "@/src/components/Disclosure";

type PnL = { premiums: number; hedge_cost: number; refunds: number; payout: number; net: number };
type Order = { id: string; ticker: string; count: number; price: number; fee: number; mode: string; status: string; note?: string; created_at: string };
type Dash = {
  merchant: Merchant;
  mode: string;
  stats: { guarantees_sold: number; active: number; refunded: number; expired: number; refund_emails_sent: number; with_email: number; contracts_held: number; hedge_cost: number; premiums: number; refund_liability: number };
  pnl: { if_rains: PnL; if_dry: PnL };
  live: Quote;
  orderbook: { asks: [number, number][]; bids: [number, number][] };
  orders: Order[];
};

export default function Dashboard() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["dash", id], queryFn: () => api<Dash>(`/merchants/${id}/dashboard`), refetchInterval: 15000 });
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
  const worst = Math.min(d.pnl.if_rains.net, d.pnl.if_dry.net);

  return (
    <View style={styles.root}>
      <Header
        title={d.merchant.name}
        subtitle={`${BUSINESS_LABELS[d.merchant.business_type]} · ${d.merchant.city}`}
        fallback="/merchants"
        right={
          <View style={[styles.badge, d.mode === "mock" ? styles.badgeMock : styles.badgeLive]} testID="trading-mode-badge">
            <Text style={[styles.badgeText, { color: d.mode === "mock" ? colors.warningText : colors.successText }]}>
              {d.mode === "mock" ? "Mock fills" : "Kalshi demo"}
            </Text>
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
      >
        <View style={styles.pad}>
          <Btn testID="open-checkout-button" label="Checkout widget" icon="phone-portrait-outline" onPress={() => router.push(`/merchant/${id}/checkout`)} />
          <View style={styles.actions}>
            <Btn testID="open-replay-button" label="Replay" icon="play-outline" variant="secondary" onPress={() => router.push(`/merchant/${id}/replay`)} style={{ flex: 1 }} />
            <Btn testID="open-share-button" label="Share link" icon="qr-code-outline" variant="secondary" onPress={() => router.push(`/merchant/${id}/share`)} style={{ flex: 1 }} />
          </View>

          <Animated.View entering={FadeInDown} style={styles.hero} testID={same ? "same-profit-banner" : "profit-hero"}>
            <Text style={styles.heroLabel}>{same ? "Profit, rain or shine" : "Profit on open bookings"}</Text>
            <Text style={styles.heroBig}>
              {worst >= 0 ? "+" : ""}
              {money(worst)}
            </Text>
            <View style={styles.heroStats}>
              <Text style={styles.heroStat} testID="metric-guarantees">
                <Text style={styles.heroStatNum}>{d.stats.guarantees_sold}</Text> guarantees
              </Text>
              <Text style={styles.heroStat} testID="metric-contracts">
                <Text style={styles.heroStatNum}>{d.stats.contracts_held.toLocaleString()}</Text> contracts held
              </Text>
            </View>
          </Animated.View>
          {d.stats.refunded + d.stats.expired > 0 ? (
            <Text style={styles.caption} testID="settled-summary">
              Settled: {d.stats.refunded} refunded · {d.stats.expired} dry · {d.stats.refund_emails_sent} refund emails sent
            </Text>
          ) : null}

          {d.stats.active === 0 ? (
            <View style={styles.empty} testID="dashboard-empty">
              <Ionicons name="sunny-outline" size={24} color={colors.warningText} />
              <Text style={styles.body}>No open guarantees yet. Sell your first one from the checkout.</Text>
            </View>
          ) : (
            <>
              <View style={styles.metrics}>
                <PnLCard title="If it rains" icon="rainy-outline" p={d.pnl.if_rains} testID="pnl-if-rains" />
                <PnLCard title="If it doesn't" icon="sunny-outline" p={d.pnl.if_dry} testID="pnl-if-dry" />
              </View>
              <Disclosure label="See the math" testID="pnl-math-toggle">
                <View style={styles.mathBox}>
                  <Line k="Refund fees collected" v={money(d.stats.premiums)} />
                  <Line k="Hedge cost (contracts + fees)" v={`−${money(d.stats.hedge_cost)}`} />
                  <Line k="If it rains: refunds paid" v={`−${money(d.pnl.if_rains.refunds)}`} />
                  <Line k="If it rains: Kalshi pays out" v={`+${money(d.pnl.if_rains.payout)}`} />
                </View>
              </Disclosure>
            </>
          )}

          <Text style={styles.h2}>This weekend in {d.merchant.city}</Text>
          <View style={styles.card} testID="live-market-card">
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.caption}>Rain chance</Text>
                <Text style={styles.huge} testID="live-yes-ask">
                  {live.yes_ask !== undefined ? pct(live.yes_ask) : "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.caption}>Refund on a {money(d.merchant.avg_booking, 0)} booking</Text>
                <Text style={styles.priceBig} testID="live-refund-price">
                  {live.available ? money(live.price) : live.reason}
                </Text>
              </View>
            </View>
            {live.available && !live.depth_ok ? (
              <View style={styles.warn} testID="depth-warning">
                <Ionicons name="warning-outline" size={16} color={colors.warningText} />
                <Text style={styles.warnText}>Thin order book — hedges may fill a little above this price.</Text>
              </View>
            ) : null}
            {live.rules_primary ? (
              <Disclosure label="Official trigger" testID="live-trigger-toggle">
                <Text style={styles.triggerText}>{live.rules_primary}</Text>
              </Disclosure>
            ) : null}
            <Disclosure label="Order book" testID="orderbook-toggle">
              {d.orderbook.asks.length === 0 ? <Text style={styles.caption}>No asks on the book.</Text> : null}
              {d.orderbook.asks.slice(0, 5).map(([price, size], i) => (
                <View key={`${price}-${i}`} style={styles.bookRow} testID={`orderbook-ask-${i}`}>
                  <View style={[styles.bookBar, { width: `${(size / maxSize) * 100}%`, backgroundColor: price <= limit ? colors.brandSecondary : colors.surfaceSecondary }]} />
                  <Text style={styles.bookPrice}>{Math.round(price * 100)}¢</Text>
                  <Text style={styles.bookSize}>{Math.round(size).toLocaleString()}</Text>
                </View>
              ))}
              <Text style={[styles.mono, { marginTop: 4 }]}>{live.ticker || live.event_ticker}</Text>
            </Disclosure>
          </View>

          <Text style={styles.h2}>Hedge orders</Text>
          <View style={styles.card} testID="hedge-order-log">
            {d.orders.length === 0 ? <Text style={styles.caption}>No hedge orders yet.</Text> : null}
            {d.orders.slice(0, 3).map((o, i) => (
              <OrderRow key={o.id} o={o} i={i} />
            ))}
            {d.orders.length > 3 ? (
              <Disclosure label={`Show all ${d.orders.length}`} testID="orders-show-all">
                {d.orders.slice(3, 50).map((o, i) => (
                  <OrderRow key={o.id} o={o} i={i + 3} />
                ))}
              </Disclosure>
            ) : null}
          </View>
        </View>
        <PitchFooter />
      </ScrollView>
    </View>
  );

  function OrderRow({ o, i }: { o: Order; i: number }) {
    return (
      <View style={[styles.orderRow, i > 0 && styles.divider]} testID={`order-row-${i}`}>
        <Text style={[styles.orderMain, { flex: 1 }]}>
          {o.count} contracts @ {Math.round(o.price * 100)}¢
          {o.mode === "kalshi_demo" ? <Text style={styles.demoTag}>{`  Kalshi demo · ${o.status}`}</Text> : null}
        </Text>
        <Text style={styles.orderMain}>{money(o.count * o.price + o.fee)}</Text>
      </View>
    );
  }

  function PnLCard({ title, icon, p, testID }: { title: string; icon: string; p: PnL; testID: string }) {
    const pos = p.net >= 0;
    return (
      <View style={styles.metric} testID={testID}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name={icon as any} size={16} color={colors.onSurfaceSecondary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Text style={[styles.value, { color: pos ? colors.successText : colors.error }]}>
          {pos ? "+" : ""}
          {money(p.net)}
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
  pad: { padding: 16, gap: 12 },
  actions: { flexDirection: "row", gap: 8 },
  metrics: { flexDirection: "row", gap: 12 },
  metric: { flex: 1, padding: 14, borderRadius: 16, backgroundColor: c.surfaceSecondary, gap: 4 },
  caption: { fontFamily: fonts.body, fontSize: 12, color: c.muted },
  huge: { fontFamily: fonts.display, fontSize: 40, color: c.onSurface, letterSpacing: -1 },
  value: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  priceBig: { fontFamily: fonts.display, fontSize: 24, color: c.brandPrimary, maxWidth: 160, textAlign: "right" },
  h2: { fontFamily: fonts.bodyBold, fontSize: 17, color: c.onSurface, marginTop: 12 },
  body: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary },
  card: { padding: 16, borderRadius: 20, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, gap: 8 },
  cardTitle: { fontFamily: fonts.bodyBold, fontSize: 13, color: c.onSurfaceSecondary },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  mono: { fontFamily: fonts.displayMd, fontSize: 12, color: c.muted },
  trigger: { padding: 12, borderRadius: 12, backgroundColor: c.surfaceTertiary, marginTop: 4 },
  triggerLabel: { fontFamily: fonts.bodyBold, fontSize: 12, color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  triggerText: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: c.onSurfaceTertiary, marginTop: 4 },
  warn: { flexDirection: "row", gap: 8, padding: 10, borderRadius: 12, backgroundColor: c.warningSoft },
  warnText: { flex: 1, fontFamily: fonts.body, fontSize: 12, lineHeight: 17, color: c.warningText },
  bookRow: { height: 32, justifyContent: "center", flexDirection: "row", alignItems: "center", paddingHorizontal: 8, overflow: "hidden", borderRadius: 6 },
  bookBar: { position: "absolute", left: 0, top: 2, bottom: 2, borderRadius: 6 },
  bookPrice: { fontFamily: fonts.display, fontSize: 14, color: c.onSurface, width: 48 },
  bookSize: { flex: 1, textAlign: "right", fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurfaceSecondary },
  orderRow: { flexDirection: "row", gap: 8, paddingVertical: 10 },
  divider: { borderTopWidth: 1, borderTopColor: c.divider },
  orderMain: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurface },
  demoTag: { fontFamily: fonts.bodySemi, fontSize: 11, color: c.successText },
  lineK: { fontFamily: fonts.body, fontSize: 13, color: c.onSurfaceSecondary },
  lineV: { fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurface },
  badge: { paddingHorizontal: 10, height: 28, borderRadius: 999, justifyContent: "center" },
  badgeMock: { backgroundColor: c.warningSoft },
  badgeLive: { backgroundColor: c.successSoft },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  empty: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: c.warningSoft },
  banner: { flexDirection: "row", gap: 10, alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: c.brandPrimary },
  bannerText: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: c.onBrandPrimary },
  hero: { padding: 20, borderRadius: 24, backgroundColor: c.brandPrimary },
  heroLabel: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.heroMuted },
  heroBig: { fontFamily: fonts.display, fontSize: 48, color: c.onBrandPrimary, letterSpacing: -1, marginTop: 4 },
  heroStats: { flexDirection: "row", gap: 16, marginTop: 8 },
  heroStat: { fontFamily: fonts.body, fontSize: 13, color: c.heroMuted },
  heroStatNum: { fontFamily: fonts.bodyBold, color: c.onBrandPrimary },
  mathBox: { padding: 12, borderRadius: 12, backgroundColor: c.surfaceSecondary, gap: 6 },
}));
