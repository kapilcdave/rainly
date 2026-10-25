import { View } from "react-native";

// Tiny column sparkline drawn with Views (oldest → newest).
export function Sparkline({ data, color, height = 24, testID }: { data: number[]; color: string; height?: number; testID?: string }) {
  if (data.length < 2) return <View style={{ height }} testID={testID} />;
  const min = Math.min(...data);
  const max = Math.max(...data);
  // Keep at least a 10-point span so 1¢ wiggles don't look like big swings.
  const range = Math.max(max - min, 0.1);
  const base = Math.max(0, Math.min(min, 1 - range));
  return (
    <View testID={testID} style={{ height, flexDirection: "row", alignItems: "flex-end", gap: 1 }}>
      {data.map((v, i) => (
        <View
          key={i}
          style={{
            flex: 1,
            height: Math.max(2, ((v - base) / range) * height),
            backgroundColor: color,
            opacity: i === data.length - 1 ? 1 : 0.28,
          }}
        />
      ))}
    </View>
  );
}
