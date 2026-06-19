import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const MyVideo = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const opacity = interpolate(frame, [0, 30], [0, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#1a1a2e",
        justifyContent: "center",
        alignItems: "center",
      }}
    >
      <div
        style={{
          opacity,
          color: "#e94560",
          fontSize: 80,
          fontWeight: "bold",
          fontFamily: "sans-serif",
        }}
      >
        Lua App
      </div>
    </AbsoluteFill>
  );
};
