// src/components/MoodSelector.jsx
import React, { useState, useEffect } from "react";
import { moodAPI } from "../api";

const MOOD_STYLES = {
  happy: {
    emoji: "😊",
    color: "#10B981",
    bg: "rgba(16,185,129,0.15)",
    border: "rgba(16,185,129,0.4)",
  },
  relaxed: {
    emoji: "😌",
    color: "#3B82F6",
    bg: "rgba(59,130,246,0.15)",
    border: "rgba(59,130,246,0.4)",
  },
  energetic: {
    emoji: "⚡",
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.15)",
    border: "rgba(245,158,11,0.4)",
  },
  romantic: {
    emoji: "💖",
    color: "#EF4444",
    bg: "rgba(239,68,68,0.15)",
    border: "rgba(239,68,68,0.4)",
  },
  adventurous: {
    emoji: "🔥",
    color: "#FF6B35",
    bg: "rgba(255,107,53,0.15)",
    border: "rgba(255,107,53,0.4)",
  },
};

const DEFAULT_STYLE = {
  emoji: "✨",
  color: "#A855F7",
  bg: "rgba(168,85,247,0.15)",
  border: "rgba(168,85,247,0.4)",
};

export default function MoodSelector({ onDone }) {
  const [moodOptions, setMoodOptions] = useState([]);
  const [selected, setSelected] = useState([]);
  const [saving, setSaving] = useState(false);
  const [prevMoods, setPrevMoods] = useState([]);

  // Load existing moods and all mood options from database
  useEffect(() => {
    const load = async () => {
      try {
        const [optionsData, currentData] = await Promise.all([
          moodAPI.getMoodOptions(),
          moodAPI.getMyMoods(),
        ]);
        if (Array.isArray(optionsData)) {
          setMoodOptions(optionsData);
        }
        if (currentData?.moods?.length > 0) {
          setPrevMoods(currentData.moods.map((m) => m.name));
          setSelected(currentData.moods.map((m) => m.id));
        }
      } catch (err) {
        console.error("Failed to load mood details:", err);
      }
    };
    load();
  }, []);

  const toggle = (id) => {
    setSelected((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length < 3
          ? [...prev, id]
          : prev,
    );
  };

  const handleSet = async () => {
    if (selected.length === 0) {
      onDone();
      return;
    }
    setSaving(true);
    try {
      await moodAPI.setMoods(selected);
    } catch (err) {
      console.error("Failed to save moods:", err);
    }
    setSaving(false);
    onDone();
  };

  return (
    <>
      {/* Backdrop */}
      <div style={s.backdrop} onClick={onDone} />

      {/* Sheet */}
      <div style={s.sheet}>
        {/* Handle */}
        <div style={s.handle} />

        {/* Header */}
        <div style={s.header}>
          <div>
            <h2 style={s.title}>What's your vibe today?</h2>
            <p style={s.sub}>
              {prevMoods.length > 0
                ? `Currently: ${prevMoods.join(", ")} · Mood resets in 6 hours`
                : "Pick up to 3 moods · Boosts matching profiles in feed"}
            </p>
          </div>
          <button style={s.closeBtn} onClick={onDone}>
            ✕
          </button>
        </div>

        {/* Mood grid */}
        <div style={s.grid}>
          {moodOptions.length === 0 ? (
            <p style={{ gridColumn: "1 / -1", textAlign: "center", color: "var(--dark-300)", fontSize: 13, padding: "20px 0" }}>
              Loading mood vibes...
            </p>
          ) : (
            moodOptions.map((m) => {
              const styleMeta = MOOD_STYLES[m.name.toLowerCase()] || DEFAULT_STYLE;
              const on = selected.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggle(m.id)}
                  style={{
                    ...s.moodBtn,
                    background: on ? styleMeta.bg : "var(--dark-700)",
                    border: on
                      ? `1.5px solid ${styleMeta.border}`
                      : "0.5px solid var(--dark-500)",
                    transform: on ? "scale(1.04)" : "scale(1)",
                  }}
                >
                  <span style={s.moodEmoji}>{styleMeta.emoji}</span>
                  <span
                    style={{
                      ...s.moodName,
                      color: on ? styleMeta.color : "var(--dark-100)",
                    }}
                  >
                    {m.name}
                  </span>
                  {on && (
                    <div style={{ ...s.checkDot, background: styleMeta.color }}>✓</div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Selected count */}
        {selected.length > 0 && (
          <p style={s.countNote}>
            {selected.length}/3 selected
            {selected.length === 3 && " · Max reached"}
          </p>
        )}

        {/* Actions */}
        <div style={s.actions}>
          <button style={s.skipBtn} onClick={onDone}>
            Keep previous
          </button>
          <button
            style={{ ...s.setBtn, opacity: saving ? 0.7 : 1 }}
            onClick={handleSet}
            disabled={saving}
          >
            {saving
              ? "Setting..."
              : selected.length > 0
                ? "Set Mood 🔥"
                : "Skip"}
          </button>
        </div>

        <p style={s.decay}>Mood resets in 6 hours · Boosts your feed ranking</p>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>
    </>
  );
}

const s = {
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    backdropFilter: "blur(2px)",
  },
  sheet: {
    position: "fixed",
    bottom: 0,
    left: "50%",
    transform: "translateX(-50%)",
    width: "100%",
    maxWidth: 560,
    background: "var(--dark-800)",
    borderRadius: "24px 24px 0 0",
    border: "0.5px solid var(--dark-600)",
    borderBottom: "none",
    padding: "12px 24px 32px",
    zIndex: 201,
    animation: "slide-up 0.3s cubic-bezier(0.32,0.72,0,1) both",
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    background: "var(--dark-500)",
    margin: "0 auto 20px",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--white)",
    margin: 0,
  },
  sub: {
    fontSize: 12,
    color: "var(--dark-300)",
    marginTop: 4,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 16,
    cursor: "pointer",
    padding: 4,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 10,
    marginBottom: 16,
  },
  moodBtn: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    padding: "14px 10px",
    borderRadius: 14,
    cursor: "pointer",
    transition: "all 0.15s ease",
  },
  moodEmoji: { fontSize: 28 },
  moodName: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--font-display)",
  },
  checkDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 16,
    height: 16,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 9,
    color: "#fff",
    fontWeight: 700,
  },
  countNote: {
    textAlign: "center",
    fontSize: 12,
    color: "var(--pink-soft)",
    marginBottom: 16,
  },
  actions: {
    display: "flex",
    gap: 10,
  },
  skipBtn: {
    flex: 1,
    height: 46,
    borderRadius: 23,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
  },
  setBtn: {
    flex: 2,
    height: 46,
    borderRadius: 23,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    boxShadow: "0 4px 20px rgba(255,31,107,0.35)",
    transition: "opacity 0.2s",
  },
  decay: {
    textAlign: "center",
    fontSize: 11,
    color: "var(--dark-500)",
    marginTop: 14,
  },
};
