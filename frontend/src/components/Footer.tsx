import { Text, View } from "react-native";
import { Logo } from "@/src/components/Logo";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts } from "@/src/format";

export function PitchFooter() {
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View testID="pitch-footer" style={styles.wrap}>
      <Logo size={18} color={colors.brandPrimary} />
      <Text style={styles.text}>
        Settled on official Weather Company / NWS station data via Kalshi, a CFTC-regulated exchange. Rain refunds are
        offered by the merchant.
      </Text>
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  wrap: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 24,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: c.border,
    marginTop: 24,
  },
  text: { flex: 1, color: c.muted, fontFamily: fonts.body, fontSize: 12, lineHeight: 18 },
}));
