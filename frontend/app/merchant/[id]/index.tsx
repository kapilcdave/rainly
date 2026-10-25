import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
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
          <Text style={[styles.badgeText, { color: d.mode === "mock" ? colors.warningText : colors.successText }]} testID="trading-mode-badge">
            {d.mode === "mock" ? "Simulated" : "Kalshi demo"}
          </Text>
        }
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={q.refetch} />}
      >
        <View style={styles.pad}>
          <Animated.View entering={FadeInDown} testID={same ? "same-profit-banner" : "profit-hero"} style={{ paddingTop: 8 }}>
            <Text style={styles.label}>{same ? "Profit, rain or shine" : "Profit on open bookings"}</Text>
            <Text style={[styles.bigNum, { color: worst >= 0 ? colors.onSurface : colors.error }]}>
              {worst >= 0 ? "+" : ""}
              {money(worst)}
            </Text>
            <Text style={styles.sub}>
              <Text testID="metric-guarantees">{d.stats.guarantees_sold} bookings covered</Text>
              {" · "}
              <Text testID="metric-contracts">{d.stats.contracts_held.toLocaleString()} contracts</Text>
            </Text>
          </Animated.View>
          {d.stats.refunded + d.stats.expired > 0 ? (
            <Text style={styles.caption} testID="settled-summary">
              Settled: {d.stats.refunded} refunded · {d.stats.expired} dry · {d.stats.refund_emails_sent} refund emails sent
            </Text>
          ) : null}

          {d.stats.active === 0 ? (
            <Text style={[styles.sub, { marginTop: 8 }]} testID="dashboard-empty">
              No open bookings yet. Sell your first rain refund from the checkout.
            </Text>
          ) : (
            <>
              <View style={styles.split}>
                <Cell label="If it rains" value={`${d.pnl.if_rains.net >= 0 ? "+" : ""}${money(d.pnl.if_rains.net)}`} testID="pnl-if-rains" />
                <View style={styles.vline} />
                <Cell label="If it's dry" value={`${d.pnl.if_dry.net >= 0 ? "+" : ""}${money(d.pnl.if_dry.net)}`} testID="pnl-if-dry" />
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

          <View style={[styles.list, { marginTop: 8 }]}>
            <ActionRow icon="phone-portrait-outline" title="Open checkout" sub="What your customers see" testID="open-checkout-button" to={`/merchant/${id}/checkout`} />
            <ActionRow icon="qr-code-outline" title="Share checkout link" sub="QR code for your counter or site" testID="open-share-button" to={`/merchant/${id}/share`} />
            <ActionRow icon="play-outline" title="Settlement replay" sub="See a real rainy day play out" testID="open-replay-button" to={`/merchant/${id}/replay`} last />
          </View>

          <Text style={[styles.label, styles.sectionGap]}>This weekend · {d.merchant.city}</Text>
          <View testID="live-market-card">
            <View style={styles.split}>
              <Cell label="Chance of rain" value={live.yes_ask !== undefined ? pct(live.yes_ask) : "—"} testID="live-yes-ask" />
              <View style={styles.vline} />
              <Cell
                label={`Refund on ${money(d.merchant.avg_booking, 0)}`}
                value={live.available ? money(live.price) : live.reason || "—"}
                testID="live-refund-price"
                small={!live.available}
              />
            </View>
            {live.available && !live.depth_ok ? (
              <Text style={[styles.caption, { color: colors.warningText }]} testID="depth-warning">
                Thin order book — hedges may fill slightly above this price.
              </Text>
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

          <Text style={[styles.label, styles.sectionGap]}>Hedge orders · {d.orders.length}</Text>
          <View testID="hedge-order-log">
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

  function Cell({ label, value, testID, small }: { label: string; value: string; testID: string; small?: boolean }) {
    return (
      <View style={styles.cell} testID={testID}>
        <Text style={styles.cellLabel}>{label}</Text>
        <Text style={small ? styles.cellSmall : styles.cellValue} numberOfLines={2}>
          {value}
        </Text>
      </View>
    );
  }

  function ActionRow({ icon, title, sub, testID, to, last }: { icon: string; title: string; sub: string; testID: string; to: string; last?: boolean }) {
    return (
      <Pressable testID={testID} onPress={() => router.push(to as any)} style={({ pressed }) => [styles.actionRow, !last && styles.divider, pressed && { opacity: 0.6 }]}>
        <Ionicons name={icon as any} size={20} color={colors.brandPrimary} />
        <View style={{ flex: 1 }}>
          <Text style={styles.actionTitle}>{title}</Text>
          <Text style={styles.caption}>{sub}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
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
  label: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.muted, textTransform: "uppercase", letterSpacing: 0.8 },
  bigNum: { fontFamily: fonts.display, fontSize: 56, letterSpacing: -2, marginTop: 4 },
  sub: { fontFamily: fonts.body, fontSize: 15, color: c.onSurfaceSecondary },
  sectionGap: { marginTop: 32 },
  split: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border, paddingVertical: 14, marginTop: 16 },
  vline: { width: StyleSheet.hairlineWidth, backgroundColor: c.border, marginHorizontal: 16 },
  cell: { flex: 1, gap: 4 },
  cellLabel: { fontFamily: fonts.body, fontSize: 13, color: c.muted },
  cellValue: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface },
  cellSmall: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.warningText },
  list: { marginTop: 24, borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.border },
  actionRow: { flexDirection: "row", alignItems: "center", gap: 14, minHeight: 64 },
  actionTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
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
  orderRow: { flexDirection: "row", gap: 8, paddingVertical: 12 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
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
