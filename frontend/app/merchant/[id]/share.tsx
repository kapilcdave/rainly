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
import * as Print from "expo-print";

// Printable tent card for tables and counters. Logo rects mirror src/components/Logo.tsx.
// Colors are fixed print colors (paper is always white), not theme tokens.
const LOGO_RECTS = [[18, 200, 60, 60], [94, 160, 60, 100], [170, 120, 60, 140], [246, 80, 60, 180], [322, 40, 60, 220], [190, 260, 20, 200], [130, 440, 80, 20], [130, 400, 20, 60]];
const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);

function tableCardHtml(name: string, qrB64: string) {
  const s = 56 / 500;
  const logo = LOGO_RECTS.map(([x, y, w, h]) => `<div style="position:absolute;left:${x * s}px;top:${y * s}px;width:${w * s}px;height:${h * s}px;background:#2563EB"></div>`).join("");
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { size: A5 portrait; margin: 0 }
    body { margin:0; font-family: -apple-system, Helvetica, Arial, sans-serif; color:#111827 }
    .card { box-sizing:border-box; width:100%; min-height:100vh; padding:48px 40px; display:flex; flex-direction:column; align-items:center; text-align:center }
    .logo { position:relative; width:${400 * s}px; height:56px }
    .brand { font-size:20px; font-weight:700; color:#2563EB; margin-top:8px }
    h1 { font-size:40px; line-height:1.05; letter-spacing:-1px; margin:40px 0 12px }
    p { font-size:18px; line-height:1.4; color:#4B5563; margin:0 }
    img { width:260px; height:260px; margin:36px 0 16px }
    .scan { font-size:16px; font-weight:700 }
    .fine { font-size:11px; color:#6B7280; margin-top:auto; padding-top:32px }
  </style></head><body><div class="card">
    <div class="logo">${logo}</div><div class="brand">Rainly</div>
    <h1>Rain on your booking?<br/>Get it back.</h1>
    <p>Add a rain refund at ${esc(name)}. If it rains, you're refunded automatically.</p>
    <img src="data:image/png;base64,${qrB64}" />
    <div class="scan">Scan to add a rain refund</div>
    <div class="fine">Settled on official Weather Company / NWS station data via Kalshi, a CFTC-regulated exchange.</div>
  </div></body></html>`;
}

export default function ShareCheckout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const merchant = useQuery({ queryKey: ["merchant", id], queryFn: () => api<Merchant>(`/merchants/${id}`) });
  const [status, setStatus] = useState("");
  const [printing, setPrinting] = useState(false);

  // App link: opens the checkout straight inside Rainly (rainly:// in builds, exp:// in Expo Go).
  const link = Linking.createURL(`/merchant/${id}/checkout`);
  const qrUri = `${process.env.EXPO_PUBLIC_BACKEND_URL}/api/qr?data=${encodeURIComponent(link)}`;

  async function printCard() {
    setStatus("");
    setPrinting(true);
    try {
      const { png_base64 } = await api<{ png_base64: string }>(`/qr?as_json=true&data=${encodeURIComponent(link)}`);
      const html = tableCardHtml(merchant.data?.name ?? "", png_base64);
      if (Platform.OS === "web") {
        // expo-print on web prints the current page, so print the card from a hidden iframe instead.
        const doc: any = (globalThis as any).document;
        const frame = doc.createElement("iframe");
        frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0";
        doc.body.appendChild(frame);
        frame.contentDocument.open();
        frame.contentDocument.write(html);
        frame.contentDocument.close();
        await new Promise((res) => setTimeout(res, 300));
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 60000);
      } else {
        await Print.printAsync({ html });
      }
    } catch {
      setStatus("error:Couldn't open the print dialog — try again");
    } finally {
      setPrinting(false);
    }
  }

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
        } else setStatus("error:Long-press the link above to copy it");
      } else {
        await Share.share({ message });
      }
    } catch (e: any) {
      if (e?.name !== "AbortError") setStatus("error:Couldn't share — long-press the link to copy it");
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
            <Text
              style={[styles.hint, { textAlign: "center", color: status.startsWith("error:") ? colors.error : colors.successText }]}
              testID="share-status"
            >
              {status.replace(/^error:/, "")}
            </Text>
          ) : null}
          <Btn testID="share-link-button" label="Share link" icon="share-outline" onPress={share} />
          <Btn testID="print-table-card-button" label="Print table card" icon="print-outline" variant="secondary" loading={printing} onPress={printCard} />
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
  title: { fontFamily: fonts.display, fontSize: 22, color: c.onSurface, textAlign: "center" },
  qrWrap: { padding: 8, borderRadius: 16, borderWidth: 1, borderColor: c.border },
  qr: { width: 220, height: 220 },
  merchant: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.onSurfaceSecondary },
  link: { flex: 1, flexShrink: 1, minWidth: 0, fontFamily: fonts.displayMd, fontSize: 13, color: c.onSurface },
  linkBox: { alignSelf: "stretch", flexDirection: "row", gap: 8, alignItems: "center", padding: 14, minHeight: 48, borderRadius: 12, backgroundColor: c.surface, overflow: "hidden" },
  hint: { fontFamily: fonts.body, fontSize: 12, color: c.muted, alignSelf: "stretch" },
}));
