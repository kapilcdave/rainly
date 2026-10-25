import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts, money } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";

type Brand = {
  brand: string;
  locations: { merchant: Merchant; sold: number; net: number }[];
  weeks: { week_of: string; sold: number; net: number }[];
  totals: { sold: number; declined: number; fees: number; net: number; attach_rate: number | null };
};

export default function BrandScreen() {
  const { brand } = useLocalSearchParams<{ brand: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const q = useQuery({ queryKey: ["brand", brand], queryFn: () => api<Brand>(`/brands/${encodeURIComponent(brand)}`) });
  const b = q.data;
  const max = Math.max(1, ...(b?.weeks.map((w) => Math.abs(w.net)) ?? [1]));

  return (
    <View style={styles.root}>
      <Header title="All locations" subtitle={brand} fallback="/merchants" />
      {q.isLoading ? <ActivityIndicator color={colors.brandPrimary} style={{ marginTop: 40 }} /> : null}
      {q.isError ? (
        <View style={{ padding: 24, gap: 12 }} testID="brand-error">
          <Text style={styles.sub}>Couldn&apos;t load your locations.</Text>
          <Btn testID="brand-retry-button" label="Retry" variant="secondary" onPress={() => q.refetch()} />
        </View>
      ) : null}
      {b ? (
        <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 20, paddingBottom: insets.bottom + 24 }}>
          <Text style={styles.label}>Combined · last 8 weeks</Text>
          <Text style={[styles.bigNum, { color: b.totals.net >= 0 ? colors.onSurface : colors.error }]} testID="brand-total-net">
            {b.totals.net >= 0 ? "+" : ""}
            {money(b.totals.net)}
          </Text>
          <Text style={styles.sub} testID="brand-total-sold">
            {b.totals.sold} refunds sold across {b.locations.length} locations
          </Text>

          <View style={styles.chart} testID="brand-chart">
            {b.weeks.map((w) => (
              <View key={w.week_of} style={styles.barCol}>
                <View style={[styles.bar, { height: Math.max(2, (Math.abs(w.net) / max) * 80), backgroundColor: w.sold ? (w.net < 0 ? colors.error : colors.brandPrimary) : colors.border }]} />
              </View>
            ))}
          </View>

          <Text style={[styles.label, { marginTop: 32 }]}>Locations</Text>
          {b.locations.map((l, i) => (
            <Pressable
              key={l.merchant.id}
              testID={`brand-location-${i}`}
              onPress={() => router.push(`/merchant/${l.merchant.id}`)}
              style={({ pressed }) => [styles.row, i > 0 && styles.divider, pressed && { opacity: 0.6 }]}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{l.merchant.city}</Text>
                <Text style={styles.caption}>{l.sold} refunds sold</Text>
              </View>
              <Text style={styles.rowNet}>
                {l.net >= 0 ? "+" : ""}
                {money(l.net)}
              </Text>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          ))}
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
  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 90, marginTop: 24 },
  barCol: { flex: 1, justifyContent: "flex-end" },
  bar: { width: "100%", borderRadius: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 64 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.border },
  rowTitle: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  caption: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 2 },
  rowNet: { fontFamily: fonts.display, fontSize: 18, color: c.onSurface },
}));
