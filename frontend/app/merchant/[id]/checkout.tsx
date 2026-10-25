import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import Animated, { FadeIn, FadeInDown, ZoomIn } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, DateOption, Merchant, Quote } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, money, pct } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { Disclosure } from "@/src/components/Disclosure";

type Result = { guarantee: any; order: { count: number; price: number; mode: string; status: string; note?: string; ticker: string } };

export default function Checkout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();

  const merchant = useQuery({ queryKey: ["merchant", id], queryFn: () => api<Merchant>(`/merchants/${id}`) });
  const meta = useQuery({ queryKey: ["meta"], queryFn: () => api<{ date_options: DateOption[]; mode: string }>("/meta") });

  const [opt, setOpt] = useState(0);
  const [value, setValue] = useState("");
  const [customer, setCustomer] = useState("");
  const [email, setEmail] = useState("");
  const [on, setOn] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const scrollRef = useRef<any>(null);

  useEffect(() => {
    if (result) scrollRef.current?.scrollTo?.({ y: 0, animated: true });
  }, [result]);

  useEffect(() => {
    if (merchant.data && !value) setValue(String(merchant.data.avg_booking));
  }, [merchant.data, value]);

  const bv = parseFloat(value) || 0;
  const dateOpt = meta.data?.date_options[opt];
  const quote = useQuery({
    queryKey: ["quote", merchant.data?.city, dateOpt?.kind, dateOpt?.date, bv, merchant.data?.margin_pct],
    enabled: !!merchant.data && !!dateOpt && bv > 0,
    refetchInterval: 15000,
    queryFn: () =>
      api<Quote>(
        `/quote?city=${encodeURIComponent(merchant.data!.city)}&booking_value=${bv}&kind=${dateOpt!.kind}&date_str=${dateOpt!.date}&margin_pct=${merchant.data!.margin_pct}`,
      ),
  });
  const qd = quote.data;
  const available = !!qd?.available;

  useEffect(() => {
    if (!available) setOn(false);
  }, [available]);

  async function confirm() {
    setError("");
    if (!on) {
      setResult({ guarantee: null, order: null as any });
      return;
    }
    const em = email.trim();
    if (em && !/^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$/.test(em)) {
      setError("Enter a valid email address");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<Result>("/guarantees", {
        method: "POST",
        body: JSON.stringify({ merchant_id: id, customer_name: customer.trim() || "Guest", customer_email: em || null, booking_value: bv, kind: dateOpt!.kind, date: dateOpt!.date }),
      });
      setResult(r);
      qc.invalidateQueries({ queryKey: ["dash", id] });
      qc.invalidateQueries({ queryKey: ["merchants"] });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setResult(null);
    setOn(false);
    setCustomer("");
    setEmail("");
  }

  const m = merchant.data;
  return (
    <View style={styles.root}>
      <Header title="Checkout" subtitle="Customer view" fallback={`/merchant/${id}`} />
      <KeyboardAwareScrollView ref={scrollRef} bottomOffset={24} contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {!m || !meta.data ? (
          <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} />
        ) : (
          <View style={styles.phone} testID="checkout-phone-frame">
            <View style={styles.notch} />
            {result ? (
              <Animated.View entering={FadeIn} style={styles.done} testID="checkout-success">
                <Animated.View entering={ZoomIn.springify()} style={[styles.check, { backgroundColor: result.guarantee ? colors.brandPrimary : colors.success }]}>
                  <Ionicons name={result.guarantee ? "umbrella" : "checkmark"} size={36} color={colors.onBrandPrimary} />
                </Animated.View>
                <Text style={styles.doneTitle}>{result.guarantee ? "You're covered" : "Booking confirmed"}</Text>
                {result.guarantee ? (
                  <>
                    <Text style={styles.doneBody}>
                      If it rains on {dateOpt?.label}, you get {money(result.guarantee.booking_value)} back automatically
                      {result.guarantee.customer_email ? ` and we'll email ${result.guarantee.customer_email}.` : "."}
                    </Text>
                    <View style={styles.hedgeBox} testID="checkout-hedge-confirmation">
                      <Text style={styles.hedgeText}>
                        Hedged: {result.order.count} contracts @ {Math.round(result.order.price * 100)}¢ on Kalshi
                        {result.order.mode === "mock" ? " (simulated)" : ` (Kalshi demo · ${result.order.status})`}
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.doneBody}>No rain refund added.</Text>
                )}
                <View style={{ gap: 8, alignSelf: "stretch", marginTop: 16 }}>
                  <Btn testID="checkout-new-booking-button" label="New booking" variant="secondary" onPress={reset} />
                  <Btn testID="checkout-to-dashboard-button" label="View dashboard" onPress={() => (router.canGoBack() ? router.back() : router.replace(`/merchant/${id}`))} />
                </View>
              </Animated.View>
            ) : (
              <Animated.View entering={FadeInDown} style={{ gap: 16 }}>
                <Text style={styles.merchant}>{m.name}</Text>

                <View>
                  <Text style={styles.label}>Date</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                    {meta.data.date_options.map((o, i) => (
                      <Pressable key={o.label} testID={`checkout-date-${i}`} onPress={() => setOpt(i)} style={[styles.chip, i === opt && styles.chipOn]}>
                        <Text style={[styles.chipText, i === opt && { color: colors.onBrandSecondary }]}>{o.label}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>

                <View>
                  <Text style={styles.label}>Booking total</Text>
                  <TextInput
                    testID="checkout-booking-input"
                    value={value}
                    onChangeText={setValue}
                    keyboardType="decimal-pad"
                    style={[styles.input, { fontFamily: fonts.display }]}
                  />
                </View>

                <View style={[styles.widget, on && styles.widgetOn]} testID="rain-refund-widget">
                  <View style={styles.widgetTop}>
                    <View style={styles.umbrella}>
                      <Ionicons name="umbrella-outline" size={22} color={colors.brandPrimary} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {quote.isLoading ? (
                        <ActivityIndicator color={colors.brandPrimary} style={{ alignSelf: "flex-start" }} />
                      ) : available ? (
                        <>
                          <Text style={styles.widgetTitle} testID="rain-refund-offer-text">
                            Rain refund +{money(qd!.price)}
                          </Text>
                          <Text style={styles.widgetSub} testID="rain-chance-text">
                            {pct(qd!.p)} chance of rain · full refund if it does
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.widgetTitle}>Rain refund unavailable</Text>
                          <Text style={[styles.widgetSub, { color: colors.warningText }]} testID="rain-refund-unavailable-reason">
                            {qd?.reason || (quote.isError ? "Couldn't reach live odds" : "")}
                            {qd?.yes_ask ? ` · rain chance ${pct(qd.yes_ask)}` : ""}
                          </Text>
                        </>
                      )}
                    </View>
                    <Pressable testID="rain-refund-toggle-area" onPress={() => available && setOn(!on)} style={styles.toggleArea}>
                      <Switch
                        testID="rain-refund-toggle"
                        value={on}
                        onValueChange={setOn}
                        disabled={!available}
                        trackColor={{ true: colors.brandPrimary, false: colors.borderStrong }}
                        thumbColor={colors.surface}
                        {...({ activeThumbColor: colors.surface } as any)}
                      />
                    </Pressable>
                  </View>
                  {on ? (
                    <Animated.View entering={FadeInDown} style={{ gap: 8 }}>
                      <TextInput
                        testID="checkout-customer-input"
                        value={customer}
                        onChangeText={setCustomer}
                        placeholder="Your name"
                        placeholderTextColor={colors.muted}
                        style={[styles.input, { backgroundColor: colors.surface }]}
                      />
                      <TextInput
                        testID="checkout-email-input"
                        value={email}
                        onChangeText={setEmail}
                        placeholder="Email for refund alerts"
                        placeholderTextColor={colors.muted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                        autoCorrect={false}
                        style={[styles.input, { backgroundColor: colors.surface }]}
                      />
                    </Animated.View>
                  ) : null}
                  {qd?.rules_primary ? (
                    <Disclosure label="Official trigger" testID="official-trigger-toggle">
                      <Text style={styles.trigger} testID="official-trigger-text">
                        {qd.rules_primary}
                      </Text>
                    </Disclosure>
                  ) : null}
                </View>


                <View style={styles.totalRow}>
                  <Text style={styles.totalLabel}>Total</Text>
                  <Text style={styles.total} testID="checkout-total">
                    {money(bv + (on && qd?.price ? qd.price : 0))}
                  </Text>
                </View>
                {error ? (
                  <Text style={styles.error} testID="checkout-error">
                    {error}
                  </Text>
                ) : null}
                <Btn testID="checkout-confirm-button" label={on ? "Confirm with rain refund" : "Confirm booking"} loading={submitting} disabled={bv <= 0} onPress={confirm} />
              </Animated.View>
            )}
          </View>
        )}

        {qd?.available && !result ? (
          <View style={styles.math}>
            <Disclosure label="How is this priced?" testID="pricing-breakdown-toggle">
              <View style={{ gap: 8 }} testID="pricing-breakdown">
                <MathRow k="Rain chance (live Kalshi price)" v={`${Math.round(qd.p! * 100)}¢`} />
                <MathRow k="Contracts to cover the booking" v={String(qd.contracts)} />
                <MathRow k="Hedge cost incl. Kalshi fee" v={money(qd.hedge_cost)} />
                <MathRow k="Merchant margin" v={`${qd.margin_pct}%`} />
                <MathRow k="Customer price" v={money(qd.price)} bold />
                <Text style={styles.small}>The refund triggers on the same station data the contract settles on.</Text>
                {!qd.depth_ok ? (
                  <View style={styles.warn} testID="checkout-depth-warning">
                    <Ionicons name="warning-outline" size={14} color={colors.warningText} />
                    <Text style={styles.warnText}>Thin market — the hedge may cost slightly more.</Text>
                  </View>
                ) : null}
              </View>
            </Disclosure>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </View>
  );

  function MathRow({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
    return (
      <View style={styles.mathRow}>
        <Text style={styles.mathK}>{k}</Text>
        <Text style={[styles.mathV, bold && { color: colors.brandPrimary, fontSize: 16 }]}>{v}</Text>
      </View>
    );
  }
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  phone: {
    alignSelf: "center",
    width: "100%",
    maxWidth: 480,
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  notch: { display: "none" },
  merchant: { fontFamily: fonts.display, fontSize: 28, color: c.onSurface, letterSpacing: -0.5 },
  small: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  label: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceSecondary, marginBottom: 6 },
  chip: { flexShrink: 0, height: 36, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: c.border, justifyContent: "center" },
  chipOn: { backgroundColor: c.brandSecondary, borderColor: c.brandPrimary },
  chipText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceSecondary },
  row2: { flexDirection: "row", gap: 8 },
  input: { height: 48, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12, fontFamily: fonts.body, fontSize: 16, color: c.onSurface, backgroundColor: c.surfaceSecondary },
  widget: { padding: 16, borderRadius: 16, borderWidth: 1, borderColor: c.border, gap: 10 },
  widgetOn: { borderColor: c.brandPrimary, borderWidth: 2, padding: 15 },
  widgetTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  umbrella: { width: 40, height: 40, borderRadius: 12, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  toggleArea: { minWidth: 56, minHeight: 48, alignItems: "center", justifyContent: "center" },
  widgetTitle: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
  widgetSub: { fontFamily: fonts.bodySemi, fontSize: 12, color: c.onSurfaceSecondary, marginTop: 2 },
  trigger: { fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: c.onSurfaceTertiary },
  warn: { flexDirection: "row", gap: 6, padding: 10, borderRadius: 10, backgroundColor: c.warningSoft },
  warnText: { flex: 1, fontFamily: fonts.body, fontSize: 11, lineHeight: 16, color: c.warningText },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  totalLabel: { fontFamily: fonts.bodySemi, fontSize: 15, color: c.onSurfaceSecondary },
  total: { fontFamily: fonts.display, fontSize: 32, color: c.onSurface },
  error: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.error },
  done: { alignItems: "center", paddingVertical: 24 },
  check: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  doneTitle: { fontFamily: fonts.display, fontSize: 26, color: c.onSurface, marginTop: 16 },
  doneBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.onSurfaceSecondary, textAlign: "center", marginTop: 6 },
  hedgeBox: { alignSelf: "stretch", padding: 12, borderRadius: 12, backgroundColor: c.surfaceTertiary, marginTop: 16 },
  hedgeLabel: { fontFamily: fonts.bodyBold, fontSize: 11, color: c.onSurfaceTertiary, textTransform: "uppercase", letterSpacing: 0.5 },
  hedgeText: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.onSurfaceTertiary, marginTop: 4 },
  math: { marginTop: 8, paddingHorizontal: 8, maxWidth: 480, width: "100%", alignSelf: "center" },
  mathTitle: { fontFamily: fonts.bodyBold, fontSize: 15, color: c.onSurface },
  mathRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  mathK: { fontFamily: fonts.body, fontSize: 13, color: c.muted, flex: 1 },
  mathV: { fontFamily: fonts.display, fontSize: 14, color: c.onSurface },
}));
