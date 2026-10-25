import { ReactNode, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Ionicons } from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { fonts } from "@/src/format";

export function Disclosure({ label, testID, children }: { label: string; testID: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const styles = useStyles();
  const { colors } = useTheme();
  return (
    <View>
      <Pressable testID={testID} onPress={() => setOpen(!open)} style={styles.row} hitSlop={4}>
        <Text style={styles.label}>{label}</Text>
        <Ionicons name={open ? "chevron-up" : "chevron-down"} size={16} color={colors.brandPrimary} />
      </Pressable>
      {open ? <Animated.View entering={FadeIn.duration(200)}>{children}</Animated.View> : null}
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  row: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6 },
  label: { fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandPrimary },
}));
