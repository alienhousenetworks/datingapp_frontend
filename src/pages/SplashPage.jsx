// src/pages/SplashPage.jsx
import React, { useEffect } from "react";

export default function SplashPage({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2000);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={s.page}>
      <div style={s.glow} />
      <div style={s.glow2} />

      <div style={s.center}>
        <div style={s.logo}>
          sp<span style={{ color: "var(--pink)" }}>y</span>ce{" "}
        </div>
        <p style={s.tagline}>Find Your Real Connection</p>

        <div style={s.dotsRow}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                ...s.dot,
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>

      <p style={s.made}>Spreading everywhere.</p>

      <style>{`
        @keyframes pulse-dot {
          0%, 80%, 100% { opacity: 0.2; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    background: "var(--dark-900)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,31,107,0.15) 0%, transparent 70%)",
    top: "10%",
    left: "20%",
    pointerEvents: "none",
  },
  glow2: {
    position: "absolute",
    width: 400,
    height: 400,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(168,85,247,0.1) 0%, transparent 70%)",
    bottom: "10%",
    right: "15%",
    pointerEvents: "none",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 16,
    animation: "fade-in-up 0.6s ease both",
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 80,
    fontWeight: 800,
    color: "var(--white)",
    letterSpacing: "-0.05em",
    lineHeight: 1,
  },
  tagline: {
    fontSize: 16,
    color: "var(--dark-300)",
    letterSpacing: "0.04em",
    margin: 0,
  },
  dotsRow: {
    display: "flex",
    gap: 8,
    marginTop: 24,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "var(--pink)",
    animation: "pulse-dot 1.2s infinite ease-in-out",
  },
  made: {
    position: "absolute",
    bottom: 32,
    fontSize: 11,
    color: "var(--dark-500)",
    letterSpacing: "0.06em",
    textTransform: "uppercase",
  },
};
