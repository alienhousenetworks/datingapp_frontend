import React from "react";
import { resolveThemeStyles } from "../utils/themeCatalog";
import { getIntentLabel } from "../utils/profileLabels";

export default function ProfileCard({ profile, onLike, onPass, onView }) {
  const themeStyles = resolveThemeStyles(profile.theme);
  const tags = profile.tags || [];
  const prompts = profile.prompts || [];
  const initial = profile.username?.[0]?.toUpperCase() || profile.letter || "?";

  return (
    <div
      style={{
        ...styles.card,
        ...themeStyles.cardStyle,
        borderWidth: "0.5px",
        borderStyle: "solid",
      }}
      onClick={() => onView(profile)}
    >
      <div style={{ ...styles.themeBar, ...themeStyles.accentBar }} />
      {/* Photo */}
      <div
        style={{
          ...styles.photo,
          background:
            profile.gradient ||
            "linear-gradient(135deg,var(--dark-700),var(--dark-600))",
        }}
      >
        {profile.images?.[0]?.image_url ? (
          <img
            src={profile.images[0].image_url}
            alt={profile.username || "profile"}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
        ) : (
          <div style={styles.avatar}>{initial}</div>
        )}
        {profile.is_online && (
          <div style={styles.activeBadge}>
            <div style={styles.activeDot} />
            <span style={styles.activeTxt}>active now</span>
          </div>
        )}

        {profile.is_liked && (
          <div
            style={{
              ...styles.likedBadge,
              top: profile.is_online ? 42 : 12,
            }}
          >
            <span style={styles.likedTxt}>♥ Liked</span>
          </div>
        )}

        {profile.distance_km !== undefined && profile.distance_km !== null && (
          <div style={styles.distBadge}>
            <span style={styles.distTxt}>{profile.distance_km} km away</span>
          </div>
        )}
      </div>

      {/* Info */}
      <div style={styles.info}>
        <div style={styles.nameRow}>
          <span style={styles.name}>{profile.username ? `@${profile.username}` : "Unknown"}</span>
          <span style={styles.agePill}>{profile.age}</span>
        </div>
        <div style={styles.sub}>
          {[
            profile.city,
            getIntentLabel(profile),
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>

        {/* Tags (mock data) */}
        {tags.length > 0 && (
          <div style={styles.tags}>
            {tags.map(([label, type]) => (
              <span key={label} className={`tag tag-${type}`}>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Bio (real API data) */}
        {profile.bio && tags.length === 0 && (
          <p style={styles.bioPreview}>
            {profile.bio.length > 80
              ? profile.bio.slice(0, 80) + "…"
              : profile.bio}
          </p>
        )}

        {/* Prompt preview (mock data) */}
        {prompts[0] && (
          <div style={styles.promptPreview}>
            <div style={styles.promptQ}>{prompts[0][0]}</div>
            <div style={styles.promptA}>"{prompts[0][1]}"</div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={styles.actions} onClick={(e) => e.stopPropagation()}>

        <button
          style={{ 
            ...styles.actionBtn, 
            ...styles.likeBtn,
            ...(profile.is_liked ? styles.likedBtn : {})
          }}
          onClick={() => !profile.is_liked && onLike(profile)}
          disabled={!!profile.is_liked}
        >
          {profile.is_liked ? "♥ Already Liked" : "♥ Like"}
        </button>
      </div>
    </div>
  );
}

const styles = {
  card: {
    background: "var(--dark-800)",
    borderRadius: 20,
    overflow: "hidden",
    cursor: "pointer",
    transition: "transform 0.2s",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
  themeBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    zIndex: 2,
  },
  photo: {
    height: 220,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: "50%",
    background: "rgba(255,31,107,0.2)",
    border: "2px solid rgba(255,31,107,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 700,
    color: "var(--pink-soft)",
  },
  activeBadge: {
    position: "absolute",
    top: 12,
    left: 12,
    background: "rgba(0,212,170,0.15)",
    border: "0.5px solid rgba(0,212,170,0.5)",
    borderRadius: 20,
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    gap: 5,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--teal)",
  },
  activeTxt: { fontSize: 10, color: "var(--teal)", fontWeight: 500 },
  likedBadge: {
    position: "absolute",
    left: 12,
    background: "rgba(255, 31, 107, 0.25)",
    border: "0.5px solid rgba(255, 31, 107, 0.6)",
    borderRadius: 20,
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    backdropFilter: "blur(4px)",
    zIndex: 2,
  },
  likedTxt: {
    fontSize: 10,
    color: "var(--pink-soft)",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.03em",
  },
  distBadge: {
    position: "absolute",
    top: 12,
    right: 12,
    background: "rgba(0,0,0,0.55)",
    border: "0.5px solid var(--dark-400)",
    borderRadius: 20,
    padding: "4px 10px",
  },
  distTxt: { fontSize: 10, color: "var(--dark-100)" },
  info: { padding: "16px 18px 10px", flex: 1 },
  nameRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  },
  name: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--white)",
  },
  agePill: {
    fontSize: 12,
    background: "var(--pink-dim)",
    color: "var(--pink-soft)",
    padding: "3px 10px",
    borderRadius: 20,
    border: "0.5px solid rgba(255,31,107,0.3)",
  },
  sub: {
    fontSize: 12,
    color: "var(--dark-200)",
    fontWeight: 300,
    marginTop: 5,
  },
  tags: { display: "flex", flexWrap: "wrap", gap: 6, margin: "10px 0" },
  bioPreview: {
    fontSize: 12,
    color: "var(--dark-300)",
    lineHeight: 1.55,
    marginTop: 8,
    margin: 0,
  },
  promptPreview: {
    background: "var(--dark-700)",
    borderRadius: 10,
    padding: "10px 12px",
    borderLeft: "2px solid var(--pink)",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    marginTop: 8,
  },
  promptQ: {
    fontSize: 10,
    color: "var(--pink-soft)",
    fontWeight: 600,
    marginBottom: 4,
  },
  promptA: {
    fontSize: 12,
    color: "var(--white)",
    fontWeight: 300,
    lineHeight: 1.55,
  },
  actions: {
    display: "flex",
    gap: 8,
    padding: "10px 18px 16px",
    borderTop: "0.5px solid var(--dark-600)",
    marginTop: "auto",
  },
  actionBtn: {
    flex: 1,
    height: 38,
    borderRadius: 24,
    fontSize: 13,
    fontWeight: 600,
    border: "none",
    fontFamily: "var(--font-display)",
    cursor: "pointer",
  },

  likeBtn: {
    background: "var(--pink)",
    color: "#fff",
    boxShadow: "0 4px 18px rgba(255,31,107,0.3)",
  },
  likedBtn: {
    background: "var(--dark-600)",
    color: "var(--dark-300)",
    border: "0.5px solid var(--dark-500)",
    boxShadow: "none",
    cursor: "not-allowed",
  },
};
