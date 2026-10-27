import { ImageResponse } from "next/og";

export const alt = "AshiruLabs: Every step, shipped.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  const steps = Array.from({ length: 9 }, (_, i) => i);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#0D1B2A", color: "#EDF2F4", position: "relative" }}>
        {steps.map((i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 640 + i * 58,
              top: 540 - i * 52,
              width: 120,
              height: 8,
              background: "rgba(119,141,169,0.18)",
              borderTop: "2px solid rgba(224,225,221,0.9)",
            }}
          />
        ))}
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, gap: 24 }}>
          <div style={{ fontSize: 28, opacity: 0.7, letterSpacing: 2 }}>ASHIRULABS</div>
          <div style={{ fontSize: 92, fontWeight: 700, lineHeight: 1, letterSpacing: -3 }}>Every step,</div>
          <div style={{ fontSize: 92, fontWeight: 300, lineHeight: 1, letterSpacing: -3, color: "#778DA9" }}>shipped.</div>
        </div>
      </div>
    ),
    size,
  );
}
