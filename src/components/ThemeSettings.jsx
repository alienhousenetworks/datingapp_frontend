import React, { useState, useEffect } from "react";
import { themeAPI, profileAPI } from "../api";
import { resolveThemeStyles } from "../utils/themeCatalog";
import FeedProfileItem from "./FeedProfileItem";

export default function ThemeSettings() {
  const [options, setOptions] = useState(null);
  const [theme, setTheme] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [opts, mine, myProfile] = await Promise.all([
        themeAPI.getOptions(),
        themeAPI.getMyTheme(),
        profileAPI.getMyProfile(),
      ]);
      setOptions(opts);
      setTheme(mine?.theme || null);
      setProfile(myProfile);
    } catch (err) {
      setError(err.message || "Failed to load theme options");
    } finally {
      setLoading(false);
    }
  };

  const applyTheme = async (patch) => {
    setSaving(true);
    setError("");
    try {
      const res = await themeAPI.updateMyTheme(patch);
      setTheme(res.theme);
    } catch (err) {
      setError(err.message || "Failed to update theme");
    } finally {
      setSaving(false);
    }
  };

  const selectLayout = (layoutId) => {
    if (theme?.layout_id === layoutId) return;
    applyTheme({ layout_id: layoutId });
  };

  const selectBackground = (bgId) => {
    if (theme?.bg_id === bgId) return;
    const bg = (options?.backgrounds || []).find((b) => b.bg_id === bgId);
    const firstVariant = bg?.variants?.[0];
    if (!firstVariant) return;
    applyTheme({ bg_id: bgId, bg_variant_id: firstVariant.bg_variant_id });
  };

  const selectVariant = (bgId, bgVariantId) => {
    if (theme?.bg_variant_id === bgVariantId) return;
    applyTheme({ bg_id: bgId, bg_variant_id: bgVariantId });
  };

  const backgrounds = options?.backgrounds || [];
  const activeBg = backgrounds.find((b) => b.bg_id === theme?.bg_id) || backgrounds[0];

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.cardLabel}>Discovery Theme</div>
        <p style={styles.hint}>Loading theme options…</p>
      </div>
    );
  }

  const preview = resolveThemeStyles(theme);

  return (
    <div style={styles.card}>
      <div style={styles.cardLabel}>
        Discovery Theme
        {saving && <span style={styles.saving}>Saving…</span>}
      </div>
      <p style={styles.hint}>
        How your card appears in other people's discovery feed.
      </p>

      {error && <p style={styles.error}>{error}</p>}

      <div style={styles.previewContainer}>
        {profile ? (
          <div style={{ pointerEvents: "none", zoom: 0.85, transformOrigin: "top center" }}>
             <FeedProfileItem 
               profile={{ ...profile, theme: theme }} 
               isPreview={true} 
             />
          </div>
        ) : (
          <div style={{ ...styles.preview, ...preview.cardStyle }}>
            <div style={{ ...styles.previewBar, ...preview.accentBar }} />
            <span style={{ ...styles.previewLabel, color: preview.accent }}>
              Your card preview · {preview.layoutId}
            </span>
          </div>
        )}
      </div>

      <div style={styles.sectionLabel}>Layout</div>
      <div style={styles.chipGrid}>
        {(options?.layouts || []).map((l) => (
          <button
            key={l.layout_id}
            type="button"
            style={{
              ...styles.chip,
              ...(theme?.layout_id === l.layout_id ? styles.chipOn : {}),
            }}
            onClick={() => selectLayout(l.layout_id)}
            disabled={saving}
          >
            <span style={styles.chipTitle}>{l.name}</span>
            <span style={styles.chipSub}>{l.description}</span>
          </button>
        ))}
      </div>

      <div style={styles.sectionLabel}>Background</div>
      {backgrounds.length === 0 ? (
        <p style={styles.emptyHint}>
          No backgrounds available. Ask an admin to run{" "}
          <code style={styles.code}>python manage.py update_themes</code>.
        </p>
      ) : (
        <>
          <div style={styles.chipGrid}>
            {backgrounds.map((bg) => {
              const preview = resolveThemeStyles({
                layout_id: theme?.layout_id,
                bg_id: bg.bg_id,
                bg_variant_id: bg.variants?.[0]?.bg_variant_id,
                color_token: bg.variants?.[0]?.color_token,
              });
              return (
                <button
                  key={bg.bg_id}
                  type="button"
                  style={{
                    ...styles.chip,
                    ...(theme?.bg_id === bg.bg_id ? styles.chipOn : {}),
                    borderLeft: `4px solid ${preview.accent}`,
                  }}
                  onClick={() => selectBackground(bg.bg_id)}
                  disabled={saving}
                >
                  <span style={styles.chipTitle}>{bg.name}</span>
                  <span style={styles.chipSub}>
                    {bg.variants?.length || 0} color variants
                  </span>
                </button>
              );
            })}
          </div>

          {activeBg && (
            <div style={styles.bgGroup}>
              <div style={styles.bgName}>
                {activeBg.name} — pick a color
              </div>
              <div style={styles.variantRow}>
                {(activeBg.variants || []).map((v) => {
                  const vPreview = resolveThemeStyles({
                    layout_id: theme?.layout_id,
                    bg_id: activeBg.bg_id,
                    bg_variant_id: v.bg_variant_id,
                    color_token: v.color_token,
                  });
                  const selected = theme?.bg_variant_id === v.bg_variant_id;
                  return (
                    <button
                      key={v.bg_variant_id}
                      type="button"
                      title={v.name}
                      style={{
                        ...styles.swatch,
                        ...vPreview.swatchStyle,
                        boxShadow: selected
                          ? `0 0 0 2px ${vPreview.accent}`
                          : "none",
                      }}
                      onClick={() => selectVariant(activeBg.bg_id, v.bg_variant_id)}
                      disabled={saving}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

const styles = {
  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "18px 20px",
  },
  cardLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--dark-300)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 8,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  saving: {
    color: "var(--teal)",
    fontSize: 10,
    fontWeight: 500,
    letterSpacing: 0,
    textTransform: "none",
  },
  hint: {
    fontSize: 11,
    color: "var(--dark-400)",
    marginBottom: 14,
    lineHeight: 1.5,
  },
  error: {
    fontSize: 12,
    color: "#EF4444",
    marginBottom: 10,
  },
  previewContainer: {
    marginBottom: 20,
    display: "flex",
    justifyContent: "center",
    overflow: "hidden"
  },
  preview: {
    borderRadius: 12,
    padding: "20px 16px",
    width: "100%",
    border: "0.5px solid var(--dark-500)",
    position: "relative",
    overflow: "hidden",
  },
  previewBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: 600,
    fontFamily: "var(--font-display)",
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--dark-300)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  chipGrid: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    textAlign: "left",
    padding: "10px 14px",
    borderRadius: 10,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    cursor: "pointer",
    transition: "border 0.15s",
  },
  chipOn: {
    border: "0.5px solid var(--pink)",
    background: "var(--pink-dim)",
  },
  chipTitle: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--white)",
  },
  chipSub: {
    display: "block",
    fontSize: 11,
    color: "var(--dark-300)",
    marginTop: 2,
  },
  bgGroup: { marginBottom: 12 },
  bgName: {
    fontSize: 12,
    color: "var(--dark-200)",
    marginBottom: 8,
  },
  variantRow: { display: "flex", flexWrap: "wrap", gap: 8 },
  swatch: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    border: "2px solid var(--dark-500)",
    cursor: "pointer",
    padding: 0,
  },
  emptyHint: {
    fontSize: 11,
    color: "var(--dark-400)",
    lineHeight: 1.5,
    marginBottom: 8,
  },
  code: {
    fontSize: 10,
    color: "var(--teal)",
    background: "var(--dark-700)",
    padding: "2px 6px",
    borderRadius: 4,
  },
};