import { ActivityIndicator, Pressable, Text, ViewStyle } from "react-native";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts } from "@/src/format";

type Props = {
  label: string;
  onPress: () => void;
  testID: string;
  variant?: "primary" | "secondary";
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

export function Btn({ label, onPress, testID, variant = "primary", icon, loading, disabled, style }: Props) {
  const styles = useStyles();
  const { colors } = useTheme();
  const fg = variant === "primary" ? colors.onBrandPrimary : colors.onBrandSecondary;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        variant === "primary" ? styles.primary : styles.secondary,
        (disabled || loading) && { opacity: 0.5 },
        pressed && { transform: [{ scale: 0.98 }], opacity: 0.9 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon ? <Ionicons name={icon as any} size={18} color={fg} /> : null}
          <Text style={[styles.label, { color: fg }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const useStyles = makeStyles((c) => ({
  base: { minHeight: 52, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 20 },
  primary: { backgroundColor: c.brandPrimary },
  secondary: { backgroundColor: c.brandSecondary },
  label: { fontFamily: fonts.bodyBold, fontSize: 16 },
}));
