import { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { KeyboardAwareScrollView, KeyboardStickyView } from "react-native-keyboard-controller";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { BUSINESS_ICONS, BUSINESS_LABELS, fonts } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";

export default function Onboarding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const cities = useQuery({ queryKey: ["cities"], queryFn: () => api<{ cities: string[] }>("/cities") });

  const params = useLocalSearchParams<{ brand?: string; type?: string; avg?: string }>();
  const [name, setName] = useState(params.brand ?? "");
  const [contactEmail, setContactEmail] = useState("");
  const [type, setType] = useState(params.type ?? "patio_restaurant");
  const [city, setCity] = useState("");
  const [avg, setAvg] = useState(params.avg ?? "40");
  const [margin, setMargin] = useState(20);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [apiError, setApiError] = useState("");

  const filtered = useMemo(
    () => (cities.data?.cities || []).filter((c) => c.toLowerCase().includes(search.toLowerCase())),
    [cities.data, search],
  );

  async function submit() {
    const e: Record<string, string> = {};
    if (!name.trim()) e.name = "Enter your business name";
    if (!city) e.city = "Pick a city";
    const v = parseFloat(avg);
    if (!v || v <= 0) e.avg = "Enter an amount above $0";
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setApiError("");
    try {
      const m = await api<Merchant>("/merchants", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), business_type: type, city, avg_booking: v, margin_pct: margin, contact_email: contactEmail.trim() || null, brand: params.brand || null }),
      });
      qc.invalidateQueries({ queryKey: ["merchants"] });
      router.replace(`/merchant/${m.id}`);
    } catch (err: any) {
      setApiError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.root}>
      <Header title={params.brand ? "Add a location" : "Set up your business"} subtitle={params.brand ? params.brand : "Takes 30 seconds"} fallback="/merchants" />
      <KeyboardAwareScrollView bottomOffset={96} contentContainerStyle={{ padding: 20, paddingBottom: 120, gap: 24 }}>
        <View>
          <Text style={styles.label}>Business name</Text>
          <TextInput
            testID="onboarding-name-input"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Sunset Mini Golf"
            placeholderTextColor={colors.muted}
            style={[styles.input, errors.name && styles.inputErr]}
          />
          {errors.name ? <Text style={styles.err}>{errors.name}</Text> : null}
        </View>

        <View>
          <Text style={styles.label}>Business type</Text>
          <View style={styles.grid}>
            {Object.keys(BUSINESS_LABELS).map((k) => {
              const on = k === type;
              return (
                <Pressable key={k} testID={`onboarding-type-${k}`} onPress={() => setType(k)} style={[styles.typeOpt, on && styles.typeOn]}>
                  <Ionicons name={BUSINESS_ICONS[k] as any} size={18} color={on ? colors.brandPrimary : colors.onSurfaceSecondary} />
                  <Text style={[styles.typeText, on && { color: colors.onBrandSecondary }]}>{BUSINESS_LABELS[k]}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View>
          <Text style={styles.label}>City</Text>
          <Pressable testID="onboarding-city-picker" onPress={() => setPicker(true)} style={[styles.input, styles.select, errors.city && styles.inputErr]}>
            <Text style={[styles.selectText, !city && { color: colors.muted }]}>{city || "Choose from Kalshi cities"}</Text>
            <Ionicons name="chevron-down" size={18} color={colors.muted} />
          </Pressable>
          <Text style={styles.hint}>Only cities with a live Kalshi rain market are listed.</Text>
          {errors.city ? <Text style={styles.err}>{errors.city}</Text> : null}
        </View>

        <View>
          <Text style={styles.label}>Average booking value</Text>
          <View style={[styles.input, styles.select, errors.avg && styles.inputErr]}>
            <Text style={styles.prefix}>$</Text>
            <TextInput
              testID="onboarding-avg-input"
              value={avg}
              onChangeText={setAvg}
              keyboardType="decimal-pad"
              style={styles.inner}
              placeholderTextColor={colors.muted}
            />
          </View>
          {errors.avg ? <Text style={styles.err}>{errors.avg}</Text> : null}
        </View>

        <View>
          <Text style={styles.label}>Email for rain alerts (optional)</Text>
          <TextInput
            testID="onboarding-contact-email-input"
            value={contactEmail}
            onChangeText={setContactEmail}
            placeholder="you@business.com"
            placeholderTextColor={colors.muted}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
          />
          <Text style={styles.hint}>We&apos;ll email you when your city&apos;s rain chance jumps — a good day to promote refunds.</Text>
        </View>

        <View>
          <Text style={styles.label}>Your pricing</Text>
          <View style={styles.seg}>
            {[
              { v: 20, l: "Add 20% margin", s: "You keep a little extra" },
              { v: 0, l: "At cost", s: "Hedge + fees only" },
            ].map((o) => (
              <Pressable key={o.v} testID={`onboarding-margin-${o.v}`} onPress={() => setMargin(o.v)} style={[styles.segOpt, margin === o.v && styles.typeOn]}>
                <Text style={[styles.typeText, margin === o.v && { color: colors.onBrandSecondary }]}>{o.l}</Text>
                <Text style={styles.hint}>{o.s}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </KeyboardAwareScrollView>

      <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
        <View style={[styles.cta, { paddingBottom: insets.bottom + 12 }]}>
          {apiError ? (
            <Text style={[styles.err, { marginTop: 0, marginBottom: 8 }]} testID="onboarding-error">
              {apiError}
            </Text>
          ) : null}
          <Btn testID="onboarding-submit-button" label="Create & open dashboard" loading={saving} onPress={submit} />
        </View>
      </KeyboardStickyView>

      <Modal visible={picker} animationType="slide" onRequestClose={() => setPicker(false)}>
        <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
          <View style={styles.modalHead}>
            <Text style={styles.modalTitle}>Choose city</Text>
            <Pressable testID="city-picker-close" onPress={() => setPicker(false)} style={styles.close}>
              <Ionicons name="close" size={22} color={colors.onSurface} />
            </Pressable>
          </View>
          <TextInput
            testID="city-search-input"
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.muted}
            style={[styles.input, { marginHorizontal: 20 }]}
          />
          <FlatList
            data={filtered}
            keyExtractor={(c) => c}
            contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 20 }}
            keyboardShouldPersistTaps="handled"
            ListEmptyComponent={<Text style={[styles.hint, { marginTop: 20 }]}>{cities.isLoading ? "Loading cities…" : "No cities found"}</Text>}
            renderItem={({ item }) => (
              <Pressable
                testID={`city-option-${item.replace(/\s/g, "-").toLowerCase()}`}
                onPress={() => {
                  setCity(item);
                  setPicker(false);
                  setSearch("");
                }}
                style={styles.cityRow}
              >
                <Text style={styles.selectText}>{item}</Text>
                {item === city ? <Ionicons name="checkmark" size={20} color={colors.brandPrimary} /> : null}
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  label: { fontFamily: fonts.bodyBold, fontSize: 15, color: c.onSurface, marginBottom: 8 },
  input: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surfaceSecondary,
    paddingHorizontal: 16,
    fontFamily: fonts.body,
    fontSize: 16,
    color: c.onSurface,
  },
  inputErr: { borderColor: c.error },
  select: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  selectText: { fontFamily: fonts.bodySemi, fontSize: 16, color: c.onSurface },
  prefix: { fontFamily: fonts.display, fontSize: 18, color: c.muted, marginRight: 6 },
  inner: { flex: 1, fontFamily: fonts.display, fontSize: 18, color: c.onSurface, minHeight: 50 },
  err: { fontFamily: fonts.bodySemi, fontSize: 13, color: c.error, marginTop: 6 },
  hint: { fontFamily: fonts.body, fontSize: 12, color: c.muted, marginTop: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeOpt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.border,
    backgroundColor: c.surface,
  },
  typeOn: { borderColor: c.brandPrimary, backgroundColor: c.brandSecondary },
  typeText: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurfaceSecondary },
  seg: { flexDirection: "row", gap: 8 },
  segOpt: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: c.border },
  cta: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: c.surface, borderTopWidth: 1, borderTopColor: c.border },
  modalHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 12 },
  modalTitle: { fontFamily: fonts.display, fontSize: 24, color: c.onSurface },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center" },
  cityRow: { minHeight: 52, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.divider },
}));
