import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
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
          <View style={styles.actions}>
            <Btn testID="open-checkout-button" label="Checkout widget" icon="phone-portrait-outline" onPress={() => router.push(`/merchant/${id}/checkout`)} style={{ flex: 1 }} />
            <Btn testID="open-replay-button" label="Replay" icon="play-outline" variant="secondary" onPress={() => router.push(`/merchant/${id}/replay`)} />
          </View>

          <Animated.View entering={FadeInDown} style={styles.metrics}>
            <Metric label="Guarantees sold" value={String(d.stats.guarantees_sold)} testID="metric-guarantees" big />
            <Metric label="Contracts held" value={String(d.stats.contracts_held)} testID="metric-contracts" big />
          </Animated.View>
          <View style={styles.metrics}>
            <Metric label="Hedge cost" value={money(d.stats.hedge_cost)} testID="metric-hedge-cost" />
            <Metric label="Refund fees collected" value={money(d.stats.premiums)} testID="metric-premiums" />
          </View>
          {d.stats.refunded + d.stats.expired > 0 ? (
            <Text style={styles.caption} testID="settled-summary">
              Settled: {d.stats.refunded} refunded · {d.stats.expired} expired dry · {d.stats.refund_emails_sent} refund emails sent
            </Text>
          ) : null}

          {d.stats.active === 0 ? (
            <View style={styles.empty} testID="dashboard-empty">
              <Ionicons name="sunny-outline" size={28} color={colors.warningText} />
              <Text style={styles.body}>No active guarantees yet. Open the checkout widget to sell your first rain refund.</Text>
            </View>
          ) : null}

          <Text style={styles.h2}>Open position · P&amp;L</Text>
          {d.stats.active > 0 && Math.abs(d.pnl.if_rains.net - d.pnl.if_dry.net) < 1 ? (
            <View style={styles.banner} testID="same-profit-banner">
              <Ionicons name="umbrella" size={20} color={colors.onBrandPrimary} />
              <Text style={styles.bannerText}>
                Same profit rain or shine: {d.pnl.if_dry.net >= 0 ? "+" : ""}
                {money(Math.min(d.pnl.if_rains.net, d.pnl.if_dry.net))}
              </Text>
            </View>
          ) : null}
          <View style={styles.metrics}>
            <PnLCard title="If it rains" icon="rainy-outline" p={d.pnl.if_rains} testID="pnl-if-rains" />
            <PnLCard title="If it doesn't" icon="sunny-outline" p={d.pnl.if_dry} testID="pnl-if-dry" />
          </View>

          <Text style={styles.h2}>Live market · {d.merchant.city} weekend</Text>
          <View style={styles.card} testID="live-market-card">
            <View style={styles.rowBetween}>
              <View>
                <Text style={styles.caption}>YES ask (rain chance)</Text>
                <Text style={styles.huge} testID="live-yes-ask">
                  {live.yes_ask !== undefined ? pct(live.yes_ask) : "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.caption}>Refund price @ {money(d.merchant.avg_booking, 0)}</Text>
                <Text style={styles.priceBig} testID="live-refund-price">
                  {live.available ? money(live.price) : live.reason}
                </Text>
              </View>
            </View>
            <Text style={styles.mono}>
              {live.ticker || live.event_ticker} · {niceDate(live.date)}
              {live.volume !== undefined ? ` · vol ${Math.round(live.volume)}` : ""}
            </Text>
            {live.rules_primary ? (
              <View style={styles.trigger}>
                <Text style={styles.triggerLabel}>Official trigger</Text>
                <Text style={styles.triggerText}>{live.rules_primary}</Text>
              </View>
            ) : null}
            {live.available && !live.depth_ok ? (
              <View style={styles.warn} testID="depth-warning">
                <Ionicons name="warning-outline" size={16} color={colors.warningText} />
                <Text style={styles.warnText}>
                  Thin book: only {live.depth_within_3c} contracts available within 3¢ of the ask ({live.contracts} needed per booking).
                </Text>
              </View>
            ) : null}

            <Text style={[styles.triggerLabel, { marginTop: 16 }]}>Order book · YES asks</Text>
            {d.orderbook.asks.length === 0 ? <Text style={styles.caption}>No asks on the book.</Text> : null}
            {d.orderbook.asks.map(([price, size], i) => (
              <View key={`${price}-${i}`} style={styles.bookRow} testID={`orderbook-ask-${i}`}>
                <View style={[styles.bookBar, { width: `${(size / maxSize) * 100}%`, backgroundColor: price <= limit ? colors.brandSecondary : colors.surfaceSecondary }]} />
                <Text style={styles.bookPrice}>{Math.round(price * 100)}¢</Text>
                <Text style={styles.bookSize}>{Math.round(size).toLocaleString()} contracts</Text>
              </View>
            ))}
            <Text style={styles.caption}>Highlighted rows are within 3¢ of the best ask.</Text>
          </View>

          <Text style={styles.h2}>Hedge order log</Text>
          <View style={styles.card} testID="hedge-order-log">
            {d.orders.length === 0 ? <Text style={styles.caption}>No hedge orders yet.</Text> : null}
            {d.orders.slice(0, 20).map((o, i) => (
              <View key={o.id} style={[styles.orderRow, i > 0 && styles.divider]} testID={`order-row-${i}`}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orderMain}>
                    Buy {o.count} YES @ {Math.round(o.price * 100)}¢
                  </Text>
                  <Text style={styles.mono} numberOfLines={1}>
                    {o.ticker} · fee {money(o.fee)}
                  </Text>
                  {o.note ? <Text style={styles.caption}>{o.note}</Text> : null}
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.orderMain}>{money(o.count * o.price + o.fee)}</Text>
                  <Text style={[styles.caption, { color: o.mode === "mock" ? colors.warningText : colors.successText }]}>
                    {o.mode === "mock" ? "mock fill" : `demo · ${o.status}`}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <PitchFooter />
      </ScrollView>
    </View>
  );

  function Metric({ label, value, testID, big }: { label: string; value: string; testID: string; big?: boolean }) {
    return (
      <View style={styles.metric} testID={testID}>
        <Text style={styles.caption}>{label}</Text>
        <Text style={big ? styles.huge : styles.value}>{value}</Text>
      </View>
    );
  }

  function PnLCard({ title, icon, p, testID }: { title: string; icon: string; p: PnL; testID: string }) {
    const pos = p.net >= 0;
    return (
      <View style={[styles.metric, { backgroundColor: pos ? colors.successSoft : colors.errorSoft }]} testID={testID}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          <Ionicons name={icon as any} size={16} color={colors.onSurfaceSecondary} />
          <Text style={styles.cardTitle}>{title}</Text>
        </View>
        <Text style={[styles.value, { color: pos ? colors.successText : colors.error }]}>
          {pos ? "+" : ""}
          {money(p.net)}
        </Text>
        <Line k="Fees in" v={money(p.premiums)} />
        <Line k="Hedge cost" v={p.hedge_cost ? `−${money(p.hedge_cost)}` : "$0"} />
        <Line k="Refunds" v={p.refunds ? `−${money(p.refunds)}` : "$0"} />
        <Line k="Kalshi payout" v={p.payout ? `+${money(p.payout)}` : "$0"} />
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
  lineK: { fontFamily: fonts.body, fontSize: 11, color: c.muted },
  lineV: { fontFamily: fonts.displayMd, fontSize: 11, color: c.onSurfaceSecondary },
  badge: { paddingHorizontal: 10, height: 28, borderRadius: 999, justifyContent: "center" },
  badgeMock: { backgroundColor: c.warningSoft },
  badgeLive: { backgroundColor: c.successSoft },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11 },
  empty: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: c.warningSoft },
  banner: { flexDirection: "row", gap: 10, alignItems: "center", padding: 16, borderRadius: 16, backgroundColor: c.brandPrimary },
  bannerText: { flex: 1, fontFamily: fonts.display, fontSize: 20, color: c.onBrandPrimary },
}));
