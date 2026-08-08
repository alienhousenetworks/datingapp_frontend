// src/pages/SplashPage.jsx
import React, { useEffect } from "react";

export default function SplashPage({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 2200);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <div style={s.page}>
      {/* Layered ambient background */}
      <div style={s.bgBase} />
      <div style={s.mesh} />
      <div style={s.orb1} />
      <div style={s.orb2} />
      <div style={s.orb3} />
      <div style={s.grid} />
      <div style={s.vignette} />

      <div style={s.center}>
        <div style={s.logoRing}>
          <div style={s.logoInner}>
            <div style={s.logo}>
              sp<span style={{ color: "var(--pink)" }}>y</span>ce
            </div>
          </div>
        </div>

        <p style={s.tagline}>no fake vibes. just real ones.</p>
        <div style={s.divider} />
        <p style={s.sub}>Intent-first dating · India first</p>

        <div style={s.loader}>
          <div style={s.loaderTrack}>
            <div style={s.loaderFill} />
          </div>
        </div>
      </div>

      <p style={s.made}>Spreading everywhere.</p>

      <style>{`
        @keyframes splash-fade-up {
          from { opacity: 0; transform: translateY(28px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes splash-ring-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,31,107,0.35), 0 0 40px rgba(255,31,107,0.2); }
          50%      { box-shadow: 0 0 0 12px rgba(255,31,107,0), 0 0 60px rgba(255,31,107,0.35); }
        }
        @keyframes splash-orb-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(18px, -14px) scale(1.06); }
        }
        @keyframes splash-orb-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50%      { transform: translate(-20px, 16px) scale(1.08); }
        }
        @keyframes splash-load {
          from { transform: translateX(-100%); }
          to   { transform: translateX(220%); }
        }
        @keyframes splash-shimmer {
          0%   { background-position: 0% 50%; }
          100% { background-position: 100% 50%; }
        }
      `}</style>
    </div>
  );
}

const s = {
  page: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    background: "#080808",
  },
  bgBase: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 80% 60% at 50% 40%, #1a0a12 0%, #0d0d0d 45%, #080808 100%)",
  },
  mesh: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 20% 30%, rgba(255,31,107,0.12) 0%, transparent 40%), radial-gradient(circle at 80% 70%, rgba(168,85,247,0.1) 0%, transparent 42%), radial-gradient(circle at 50% 90%, rgba(0,212,170,0.06) 0%, transparent 35%)",
    pointerEvents: "none",
  },
  orb1: {
    position: "absolute",
    width: 420,
    height: 420,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,31,107,0.22) 0%, transparent 68%)",
    top: "8%",
    left: "12%",
    filter: "blur(8px)",
    animation: "splash-orb-drift 8s ease-in-out infinite",
    pointerEvents: "none",
  },
  orb2: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(168,85,247,0.18) 0%, transparent 70%)",
    bottom: "12%",
    right: "8%",
    filter: "blur(10px)",
    animation: "splash-orb-drift-2 10s ease-in-out infinite",
    pointerEvents: "none",
  },
  orb3: {
    position: "absolute",
    width: 200,
    height: 200,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(0,212,170,0.12) 0%, transparent 70%)",
    top: "55%",
    left: "55%",
    filter: "blur(6px)",
    animation: "splash-orb-drift 12s ease-in-out infinite reverse",
    pointerEvents: "none",
  },
  grid: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
    maskImage:
      "radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 75%)",
    WebkitMaskImage:
      "radial-gradient(ellipse 70% 60% at 50% 45%, black 20%, transparent 75%)",
    pointerEvents: "none",
    opacity: 0.5,
  },
  vignette: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.55) 100%)",
    pointerEvents: "none",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 0,
    zIndex: 2,
    animation: "splash-fade-up 0.9s cubic-bezier(0.22, 1, 0.36, 1) both",
  },
  logoRing: {
    width: 168,
    height: 168,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background:
      "linear-gradient(145deg, rgba(255,31,107,0.35), rgba(168,85,247,0.15), rgba(255,31,107,0.05))",
    padding: 2,
    animation: "splash-ring-pulse 2.4s ease-in-out infinite",
    marginBottom: 28,
  },
  logoInner: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background:
      "radial-gradient(circle at 40% 35%, #1c1018 0%, #0d0d0d 70%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    border: "1px solid rgba(255,31,107,0.25)",
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 36,
    fontWeight: 800,
    color: "var(--white)",
    letterSpacing: "-0.04em",
    lineHeight: 1,
  },
  tagline: {
    fontSize: 15,
    color: "var(--dark-100)",
    letterSpacing: "0.02em",
    margin: 0,
    fontWeight: 500,
  },
  divider: {
    width: 48,
    height: 2,
    margin: "16px 0 12px",
    borderRadius: 2,
    background:
      "linear-gradient(90deg, transparent, var(--pink), transparent)",
  },
  sub: {
    fontSize: 12,
    color: "var(--dark-300)",
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    margin: 0,
    fontWeight: 600,
  },
  loader: {
    marginTop: 36,
    width: 140,
  },
  loaderTrack: {
    height: 3,
    borderRadius: 3,
    background: "rgba(255,255,255,0.08)",
    overflow: "hidden",
  },
  loaderFill: {
    width: "40%",
    height: "100%",
    borderRadius: 3,
    background:
      "linear-gradient(90deg, transparent, var(--pink), var(--pink-soft), transparent)",
    animation: "splash-load 1.4s ease-in-out infinite",
  },
  made: {
    position: "absolute",
    bottom: 32,
    fontSize: 11,
    color: "var(--dark-500)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    zIndex: 2,
  },
};
