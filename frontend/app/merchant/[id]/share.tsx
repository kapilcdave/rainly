import { useState } from "react";
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, Text, View } from "react-native";
import { useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Image } from "expo-image";
import { useQuery } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@react-native-vector-icons/ionicons";

import { api, Merchant } from "@/src/api";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts } from "@/src/format";
import { Header } from "@/src/components/Header";
import { Btn } from "@/src/components/Btn";
import { Logo } from "@/src/components/Logo";

export default function ShareCheckout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const merchant = useQuery({ queryKey: ["merchant", id], queryFn: () => api<Merchant>(`/merchants/${id}`) });
  const [status, setStatus] = useState("");

  // App link: opens the checkout straight inside Rainly (rainly:// in builds, exp:// in Expo Go).
  const link = Linking.createURL(`/merchant/${id}/checkout`);
  const qrUri = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/qr?data=${encodeURIComponent(link)}`;

  async function share() {
    setStatus("");
    const message = `Add a rain refund to your ${merchant.data?.name ?? ""} booking: ${link}`;
    try {
      if (Platform.OS === "web") {
        const nav: any = (globalThis as any).navigator;
        if (nav?.share) await nav.share({ title: "Rainly checkout", text: message });
        else if (nav?.clipboard?.writeText) {
          await nav.clipboard.writeText(link);
          setStatus("Link copied");
        } else setStatus("Long-press the link above to copy it");
      } else {
        await Share.share({ message });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setStatus("Couldn't share — long-press the link to copy it");
    }
  }

  return (
    <View style={styles.root}>
      <Header title="Share checkout" subtitle={merchant.data?.name} fallback={`/merchant/${id}`} />
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20, alignItems: "center" }}>
        <View style={styles.card} testID="share-qr-card">
          <View style={styles.brandRow}>
            <Logo size={22} color={colors.brandPrimary} />
            <Text style={styles.brand}>Rainly</Text>
          </View>
          <Text style={styles.title}>Scan for a rain refund</Text>
          <View style={styles.qrWrap}>
            <Image source={{ uri: qrUri }} style={styles.qr} contentFit="contain" testID="share-qr-image" />
          </View>
          {merchant.isLoading ? <ActivityIndicator color={colors.brandPrimary} /> : <Text style={styles.merchant}>{merchant.data?.name}</Text>}
        </View>

        <Pressable style={styles.linkBox} testID="share-link-text" onPress={() => Linking.openURL(link)}>
          <Ionicons name="link-outline" size={18} color={colors.brandPrimary} />
          <Text style={styles.link} numberOfLines={2} selectable>
            {link}
          </Text>
        </Pressable>
        <Text style={styles.hint}>
          {Platform.OS === "web"
            ? "In the browser this opens the checkout page. Inside the Rainly app, the link opens checkout in the app."
            : "Opens the checkout in the Rainly app. Customers need the app installed."}
        </Text>

        <View style={{ alignSelf: "stretch", gap: 8 }}>
          {status ? (
            <Text style={[styles.hint, { textAlign: "center", color: colors.successText }]} testID="share-status">
              {status}
            </Text>
          ) : null}
          <Btn testID="share-link-button" label="Share link" icon="share-outline" onPress={share} />
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  card: { width: "100%", maxWidth: 340, padding: 24, borderRadius: 24, backgroundColor: c.surface, alignItems: "center", gap: 12 },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brand: { fontFamily: fonts.display, fontSize: 18, color: c.brandPrimary },
  title: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface },
  qrWrap: { padding: 8, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  qr: { width: 220, height: 220 },
  merchant: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurfaceSecondary },
  link: { flex: 1, flexShrink: 1, minWidth: 0, fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurface },
  linkBox: { alignSelf: "stretch", flexDirection: "row", gap: 8, alignItems: "center", padding: 14, minHeight: 48, borderRadius: 12, backgroundColor: c.surface, overflow: "hidden" },
  hint: { fontFamily: fonts.body, fontSize: 12, color: c.muted, alignSelf: "stretch" },
}));
