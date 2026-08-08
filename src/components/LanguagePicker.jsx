import React, { useMemo, useState } from "react";

/** Names shown as quick picks when catalog is large (India-first). */
const FEATURED_NAMES = ["English", "Hindi", "Bengali", "Tamil", "Telugu"];

/**
 * Language multi-select: 4–5 featured chips + search for the full catalog.
 * @param {Array<{id:string,name:string}>} options
 * @param {string[]} value - selected language names
 * @param {(names: string[]) => void} onChange
 */
export default function LanguagePicker({
  options = [],
  value = [],
  onChange,
  maxVisibleFeatured = 5,
}) {
  const [query, setQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

  const selected = useMemo(
    () => new Set((value || []).map((v) => String(v))),
    [value]
  );

  const featured = useMemo(() => {
    if (!options.length) return [];
    const byName = new Map(options.map((o) => [o.name.toLowerCase(), o]));
    const picks = [];
    for (const name of FEATURED_NAMES) {
      const hit = byName.get(name.toLowerCase());
      if (hit) picks.push(hit);
      if (picks.length >= maxVisibleFeatured) break;
    }
    // Fallback: first N from API order if catalog is custom
    if (picks.length < 3) {
      for (const o of options) {
        if (!picks.find((p) => p.id === o.id)) picks.push(o);
        if (picks.length >= maxVisibleFeatured) break;
      }
    }
    return picks;
  }, [options, maxVisibleFeatured]);

  const featuredIds = useMemo(
    () => new Set(featured.map((f) => f.id)),
    [featured]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // When search open with empty query, show non-featured sorted by name
      return options
        .filter((o) => !featuredIds.has(o.id))
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return options
      .filter((o) => o.name.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [options, query, featuredIds]);

  const toggle = (name) => {
    if (selected.has(name)) {
      onChange(value.filter((v) => v !== name));
    } else {
      onChange([...value, name]);
    }
  };

  const selectedOutsideFeatured = value.filter(
    (n) => !featured.some((f) => f.name === n)
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.sectionLabel}>Popular</div>
      <div style={styles.chipRow}>
        {featured.map((l) => {
          const on = selected.has(l.name);
          return (
            <button
              key={l.id}
              type="button"
              style={{
                ...styles.chip,
                ...(on ? styles.chipOn : styles.chipOff),
              }}
              onClick={() => toggle(l.name)}
            >
              {l.name}
              {on ? " ✓" : ""}
            </button>
          );
        })}
      </div>

      {selectedOutsideFeatured.length > 0 && (
        <>
          <div style={{ ...styles.sectionLabel, marginTop: 16 }}>Selected</div>
          <div style={styles.chipRow}>
            {selectedOutsideFeatured.map((name) => (
              <button
                key={name}
                type="button"
                style={{ ...styles.chip, ...styles.chipOn }}
                onClick={() => toggle(name)}
              >
                {name} ✓
              </button>
            ))}
          </div>
        </>
      )}

      <button
        type="button"
        style={styles.searchToggle}
        onClick={() => setShowSearch((v) => !v)}
      >
        {showSearch
          ? "Hide search"
          : "Don't see your language? Search all…"}
      </button>

      {showSearch && (
        <div style={styles.searchPanel}>
          <input
            type="search"
            placeholder="Search languages (e.g. Assamese, Korean…)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={styles.searchInput}
            autoFocus
          />
          <div style={styles.searchList}>
            {filtered.length === 0 ? (
              <p style={styles.empty}>No languages match “{query}”.</p>
            ) : (
              filtered.map((l) => {
                const on = selected.has(l.name);
                return (
                  <button
                    key={l.id}
                    type="button"
                    style={{
                      ...styles.listRow,
                      ...(on ? styles.listRowOn : null),
                    }}
                    onClick={() => toggle(l.name)}
                  >
                    <span>{l.name}</span>
                    <span style={styles.check}>{on ? "✓" : ""}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}

      <p style={styles.hint}>
        {value.length === 0
          ? "Select at least one language"
          : `${value.length} language${value.length === 1 ? "" : "s"} selected`}
      </p>
    </div>
  );
}

const styles = {
  wrap: { width: "100%" },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--dark-300)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    marginBottom: 10,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 22,
    padding: "10px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid transparent",
    transition: "all 0.15s ease",
  },
  chipOn: {
    background: "rgba(255, 31, 107, 0.18)",
    borderColor: "var(--pink)",
    color: "var(--pink-soft)",
  },
  chipOff: {
    background: "rgba(255,255,255,0.04)",
    borderColor: "var(--dark-500)",
    color: "var(--white)",
  },
  searchToggle: {
    marginTop: 18,
    background: "transparent",
    border: "none",
    color: "var(--pink-soft)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: 0,
    textAlign: "left",
  },
  searchPanel: {
    marginTop: 12,
    borderRadius: 14,
    border: "1px solid rgba(255,31,107,0.18)",
    background: "rgba(0,0,0,0.35)",
    overflow: "hidden",
  },
  searchInput: {
    width: "100%",
    boxSizing: "border-box",
    border: "none",
    borderBottom: "1px solid var(--dark-600)",
    background: "var(--dark-800)",
    color: "var(--white)",
    padding: "12px 14px",
    fontSize: 14,
    outline: "none",
  },
  searchList: {
    maxHeight: 200,
    overflowY: "auto",
  },
  listRow: {
    width: "100%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "11px 14px",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(255,255,255,0.04)",
    color: "var(--white)",
    fontSize: 14,
    cursor: "pointer",
    textAlign: "left",
  },
  listRowOn: {
    background: "rgba(255, 31, 107, 0.1)",
    color: "var(--pink-soft)",
  },
  check: { color: "var(--pink)", fontWeight: 700, minWidth: 16 },
  empty: {
    padding: 16,
    color: "var(--dark-300)",
    fontSize: 13,
    margin: 0,
  },
  hint: {
    marginTop: 12,
    fontSize: 12,
    color: "var(--dark-300)",
  },
};
