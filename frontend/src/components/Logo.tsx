import { View } from "react-native";

// Umbrella bar-chart mark, drawn from the 400x500 SVG rectangles.
const RECTS = [
  [18, 200, 60, 60],
  [94, 160, 60, 100],
  [170, 120, 60, 140],
  [246, 80, 60, 180],
  [322, 40, 60, 220],
  [190, 260, 20, 200],
  [130, 440, 80, 20],
  [130, 400, 20, 60],
];

export function Logo({ size = 32, color }: { size?: number; color: string }) {
  const s = size / 500;
  return (
    <View testID="rainly-logo" style={{ width: 400 * s, height: 500 * s }}>
      {RECTS.map(([x, y, w, h], i) => (
        <View
          key={i}
          style={{ position: "absolute", left: x * s, top: y * s, width: w * s, height: h * s, backgroundColor: color }}
        />
      ))}
    </View>
  );
}
