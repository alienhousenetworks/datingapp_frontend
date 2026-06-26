import React, { useState } from "react";
import { interactionAPI, moderationAPI } from "../api";
import { resolveThemeStyles } from "../utils/themeCatalog";
import { getIntentLabel, getSexualityLabel } from "../utils/profileLabels";

const DM_ERROR_MESSAGES = {
  ineligible_dm: "You're not eligible to message this user based on profile settings.",
  quota_exceeded: "Daily direct message limit reached (15). Try again tomorrow.",
  duplicate_request: "You already have a pending request with this user.",
  missing_attributes: "Set your gender and sexuality in profile settings first.",
  blocked: "You are blocked by this user.",
  profile_not_found: "User profile not found.",
};

export default function ProfileDetail({ profile, onClose, onLike, onPass }) {
  const [liked, setLiked] = useState(false);
  const [passed, setPassed] = useState(false);
  const [activeImageIdx, setActiveImageIdx] = useState(0);

  // New features state
  const [showDirectRequestModal, setShowDirectRequestModal] = useState(false);
  const [directRequestMessage, setDirectRequestMessage] = useState("");
  const [sendingDirectRequest, setSendingDirectRequest] = useState(false);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  const handleSendDirectRequest = async () => {
    if (!directRequestMessage.trim()) return;
    setSendingDirectRequest(true);
    try {
      const res = await interactionAPI.startConversation(profile.id, directRequestMessage.trim());
      if (res.error) {
        alert(DM_ERROR_MESSAGES[res.code] || res.error);
      } else {
        alert(`Direct request sent! Remaining today: ${res.count_remaining}`);
        setShowDirectRequestModal(false);
        setDirectRequestMessage("");
      }
    } catch (err) {
      const code = err.data?.code;
      alert(DM_ERROR_MESSAGES[code] || err.message || "Failed to send request.");
    } finally {
      setSendingDirectRequest(false);
    }
  };

  const handleSubmitReport = async () => {
    if (reportReason === "OTHER" && !reportDescription.trim()) {
      alert("Please provide a description for the report");
      return;
    }
    setSubmittingReport(true);
    try {
      const res = await moderationAPI.submitReport({
        reportedUserId: profile.id,
        reason: reportReason,
        description: reportDescription.trim(),
        targetType: "USER_PROFILE",
        targetId: profile.id
      });
      alert(res.message || "Profile reported successfully.");
      setShowReportModal(false);
      setReportDescription("");
    } catch {
      alert("Failed to submit report");
    } finally {
      setSubmittingReport(false);
    }
  };

  if (!profile) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>⬡</div>
        <div style={styles.emptyText}>Click a profile to view details</div>
      </div>
    );
  }

  // Safe fallbacks for both real API and mock data
  const tags = profile.tags || [];
  const prompts = profile.prompts || [];
  const initial = profile.name?.[0]?.toUpperCase() || profile.letter || "?";
  const themeStyles = resolveThemeStyles(profile.theme);

  const handleLike = async () => {
    if (profile.is_liked) return;
    setLiked(true);
    try {
      await interactionAPI.like(profile.id);
    } catch {}
    setTimeout(() => {
      onLike(profile);
      onClose();
    }, 600);
  };

  const handlePass = async () => {
    setPassed(true);
    try {
      await interactionAPI.pass(profile.id);
    } catch {}
    setTimeout(() => {
      onPass(profile);
      onClose();
    }, 400);
  };

  return (
    <div style={{ ...styles.panel, borderLeftColor: `${themeStyles.accent}44` }}>
      <button style={styles.closeBtn} onClick={onClose}>
        ✕
      </button>

      {/* Hero */}
      <div
        style={{
          ...styles.hero,
          background:
            themeStyles.cardStyle.background ||
            profile.gradient ||
            "linear-gradient(135deg,var(--dark-700),var(--dark-600))",
        }}
      >
        {profile.images?.[activeImageIdx]?.image_url ? (
          <img
            src={profile.images[activeImageIdx].image_url}
            alt={profile.name}
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
          <div style={styles.heroAvatar}>{initial}</div>
        )}
      </div>

      {/* Thumbnail Gallery */}
      {profile.images && profile.images.length > 1 && (
        <div style={styles.thumbnailGallery}>
          {profile.images.map((img, i) => (
            <div 
              key={i} 
              onClick={() => setActiveImageIdx(i)}
              style={{
                ...styles.thumbnailWrapper,
                borderColor: i === activeImageIdx ? "var(--pink)" : "transparent"
              }}
            >
              <img 
                src={img.image_url} 
                alt={`${profile.name} ${i}`} 
                style={styles.thumbnailImg} 
                onError={(e) => { e.target.style.display = "none"; }}
              />
            </div>
          ))}
        </div>
      )}

      {/* Body */}
      <div style={styles.body}>
        <div style={styles.nameRow}>
          <div>
            <h2 style={styles.name}>
              {profile.name}, {profile.age}
            </h2>
            <p style={styles.meta}>
              {[
                profile.city,
                profile.distance_km !== undefined && profile.distance_km !== null
                  ? `${profile.distance_km} km away`
                  : null,
                getIntentLabel(profile),
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
            {profile.is_liked && (
              <div style={{
                ...styles.activeBadge,
                background: "rgba(255, 31, 107, 0.2)",
                borderColor: "rgba(255, 31, 107, 0.5)"
              }}>
                <span style={{ fontSize: 10, color: "var(--pink-soft)", fontWeight: 600 }}>♥ Liked</span>
              </div>
            )}
            <div style={styles.activeBadge}>
              <div style={styles.activeDot} />
              <span style={styles.activeTxt}>active</span>
            </div>
          </div>
        </div>

        {/* Tags — mock data */}
        {tags.length > 0 && (
          <div style={styles.tags}>
            {tags.map(([label, type]) => (
              <span key={label} className={`tag tag-${type}`}>
                {label}
              </span>
            ))}
          </div>
        )}

        {/* Bio — real API data */}
        {profile.bio && (
          <div style={styles.bioBlock}>
            <div style={styles.sectionLabel}>About</div>
            <p style={styles.bioText}>{profile.bio}</p>
          </div>
        )}

        {/* Intent / languages / sexuality / turn ons badges — real API */}
        {(getIntentLabel(profile) || profile.languages || getSexualityLabel(profile, null) || (profile.turn_ons && profile.turn_ons.length > 0)) && (
          <div style={styles.apiBadges}>
            {getIntentLabel(profile) && (
              <span style={styles.apiBadge}>🎯 {getIntentLabel(profile)}</span>
            )}
            {getSexualityLabel(profile, null) && (
              <span style={styles.apiBadge}>✨ {getSexualityLabel(profile)}</span>
            )}
            {profile.languages && (
              <span style={styles.apiBadge}>
                🌐 {Array.isArray(profile.languages) ? profile.languages.join(", ") : typeof profile.languages === "string" ? profile.languages : ""}
              </span>
            )}
            {profile.turn_ons_detail && profile.turn_ons_detail.length > 0 && (
              <span style={styles.apiBadge}>🔥 {profile.turn_ons_detail.map(t => t.name).join(", ")}</span>
            )}
            {profile.completion_percentage > 0 && (
              <span style={{ ...styles.apiBadge, color: "var(--pink-soft)" }}>
                {profile.completion_percentage}% profile
              </span>
            )}
          </div>
        )}

        {/* Prompts — mock data */}
        {prompts.length > 0 && (
          <>
            <div style={styles.divider} />
            <div style={styles.sectionLabel}>Their takes</div>
            {prompts.map(([q, a]) => (
              <div key={q} style={styles.promptCard}>
                <div style={styles.promptQ}>{q}</div>
                <div style={styles.promptA}>"{a}"</div>
              </div>
            ))}
          </>
        )}

        <div style={styles.divider} />
        
        {/* Extra options: Direct Request & Report */}
        <div style={{ display: "flex", gap: 10, margin: "16px 0 8px" }}>
          {profile.can_direct_message && (
            <button
              style={styles.directRequestBtn}
              onClick={() => setShowDirectRequestModal(true)}
            >
              💬 Direct Request
            </button>
          )}
          <button
            style={styles.reportProfileBtn}
            onClick={() => setShowReportModal(true)}
          >
            ⚑ Report Profile
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div style={styles.actionBar}>
        <button
          style={{
            ...styles.actionBtn,
            ...styles.likeBtn,
            ...((liked || profile.is_liked) ? styles.likedBtn : {}),
            opacity: (liked || profile.is_liked) ? 0.7 : 1,
          }}
          onClick={handleLike}
          disabled={liked || passed || !!profile.is_liked}
        >
          {profile.is_liked ? "♥ Already Liked" : liked ? "♥ Liked!" : "♥  Like"}
        </button>
      </div>

      {showDirectRequestModal && (
        <>
          <div style={styles.modalBackdrop} onClick={() => setShowDirectRequestModal(false)} />
          <div style={styles.customModal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Send Direct Message 💬</h3>
              <button style={styles.modalCloseBtn} onClick={() => setShowDirectRequestModal(false)}>✕</button>
            </div>
            <p style={{ fontSize: 12, color: "var(--dark-300)", marginBottom: 12, lineHeight: 1.4 }}>
              Send a direct chat request to start a conversation without matching first. Up to 15 per day.
            </p>
            <textarea
              style={styles.customTextarea}
              value={directRequestMessage}
              onChange={(e) => setDirectRequestMessage(e.target.value)}
              placeholder="Write a charming introductory message..."
              rows={4}
            />
            <button
              style={{ ...styles.modalSubmitBtn, opacity: sendingDirectRequest || !directRequestMessage.trim() ? 0.6 : 1 }}
              onClick={handleSendDirectRequest}
              disabled={sendingDirectRequest || !directRequestMessage.trim()}
            >
              {sendingDirectRequest ? "Sending..." : "Send Request"}
            </button>
          </div>
        </>
      )}

      {showReportModal && (
        <>
          <div style={styles.modalBackdrop} onClick={() => setShowReportModal(false)} />
          <div style={styles.customModal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Report Profile ⚑</h3>
              <button style={styles.modalCloseBtn} onClick={() => setShowReportModal(false)}>✕</button>
            </div>
            <label style={styles.customLabel}>Reason</label>
            <select
              style={styles.customSelect}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            >
              <option value="SPAM">Spam</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="FAKE_PROFILE">Fake Profile</option>
              <option value="OTHER">Other (specify below)</option>
            </select>
            <label style={styles.customLabel}>Description</label>
            <textarea
              style={styles.customTextarea}
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
              placeholder="Provide more context..."
              rows={3}
            />
            <button
              style={{ ...styles.modalSubmitBtn, background: "#EF4444", opacity: submittingReport ? 0.6 : 1 }}
              onClick={handleSubmitReport}
              disabled={submittingReport}
            >
              {submittingReport ? "Submitting..." : "Submit Report"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const styles = {
  panel: {
    flex: 1,
    background: "var(--dark-800)",
    borderLeft: "0.5px solid var(--dark-600)",
    display: "flex",
    flexDirection: "column",
    position: "relative",
    overflow: "hidden",
    minWidth: 340,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "var(--dark-900)",
    borderLeft: "0.5px solid var(--dark-600)",
    minWidth: 340,
  },
  emptyIcon: { fontSize: 40, color: "var(--dark-500)" },
  emptyText: {
    fontSize: 14,
    color: "var(--dark-300)",
    fontFamily: "var(--font-display)",
  },
  closeBtn: {
    position: "absolute",
    top: 14,
    right: 14,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.5)",
    border: "0.5px solid var(--dark-400)",
    color: "var(--dark-100)",
    fontSize: 13,
    cursor: "pointer",
  },
  hero: {
    height: 260,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    overflow: "hidden",
  },
  heroAvatar: {
    width: 90,
    height: 90,
    borderRadius: "50%",
    background: "rgba(255,31,107,0.2)",
    border: "2.5px solid rgba(255,31,107,0.6)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontSize: 36,
    fontWeight: 700,
    color: "var(--pink-soft)",
  },
  thumbnailGallery: {
    display: "flex",
    gap: 8,
    padding: "12px 24px 0",
    overflowX: "auto",
    scrollBehavior: "smooth",
    WebkitOverflowScrolling: "touch",
  },
  thumbnailWrapper: {
    width: 60,
    height: 80,
    borderRadius: 8,
    border: "2px solid",
    overflow: "hidden",
    flexShrink: 0,
    cursor: "pointer",
    background: "var(--dark-700)",
  },
  thumbnailImg: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  body: { flex: 1, overflowY: "auto", padding: "20px 24px 12px" },
  nameRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  name: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 700,
    color: "var(--white)",
  },
  meta: {
    fontSize: 12,
    color: "var(--dark-200)",
    fontWeight: 300,
    marginTop: 5,
  },
  activeBadge: {
    background: "rgba(0,212,170,0.12)",
    border: "0.5px solid rgba(0,212,170,0.4)",
    borderRadius: 20,
    padding: "5px 11px",
    display: "flex",
    alignItems: "center",
    gap: 5,
    flexShrink: 0,
  },
  activeDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--teal)",
  },
  activeTxt: { fontSize: 10, color: "var(--teal)", fontWeight: 500 },
  tags: { display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 16 },
  bioBlock: { marginBottom: 16 },
  bioText: {
    fontSize: 14,
    color: "var(--dark-100)",
    lineHeight: 1.65,
    margin: 0,
  },
  apiBadges: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 },
  apiBadge: {
    fontSize: 11,
    background: "var(--dark-700)",
    color: "var(--dark-200)",
    padding: "5px 12px",
    borderRadius: 99,
    border: "0.5px solid var(--dark-500)",
  },
  divider: { height: "0.5px", background: "var(--dark-600)", marginBottom: 16 },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: "var(--dark-300)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: "var(--font-display)",
    marginBottom: 10,
  },
  promptCard: {
    background: "var(--dark-700)",
    borderRadius: 12,
    padding: "12px 14px",
    borderLeft: "2.5px solid var(--pink)",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    marginBottom: 10,
  },
  promptQ: {
    fontSize: 10,
    color: "var(--pink-soft)",
    fontWeight: 600,
    marginBottom: 5,
  },
  promptA: {
    fontSize: 14,
    color: "var(--white)",
    fontWeight: 300,
    lineHeight: 1.6,
  },
  actionBar: {
    display: "flex",
    gap: 10,
    padding: "14px 24px 20px",
    borderTop: "0.5px solid var(--dark-600)",
    background: "var(--dark-800)",
  },
  actionBtn: {
    flex: 1,
    height: 44,
    borderRadius: 24,
    fontSize: 14,
    fontWeight: 700,
    border: "none",
    fontFamily: "var(--font-display)",
    cursor: "pointer",
  },

  likeBtn: {
    background: "var(--pink)",
    color: "#fff",
    boxShadow: "0 4px 20px rgba(255,31,107,0.35)",
  },
  likedBtn: {
    background: "var(--dark-600)",
    color: "var(--dark-300)",
    border: "0.5px solid var(--dark-500)",
    boxShadow: "none",
    cursor: "not-allowed",
  },
  directRequestBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    background: "var(--pink-dim)",
    border: "0.5px solid rgba(255,31,107,0.3)",
    color: "var(--pink-soft)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  reportProfileBtn: {
    flex: 1,
    height: 38,
    borderRadius: 19,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-100)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  modalBackdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    backdropFilter: "blur(2px)",
  },
  customModal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: "90%",
    maxWidth: 400,
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 20,
    padding: "24px",
    zIndex: 201,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--white)",
    margin: 0,
  },
  modalCloseBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 16,
    cursor: "pointer",
  },
  customTextarea: {
    width: "100%",
    borderRadius: 10,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 13,
    padding: "10px 14px",
    color: "var(--white)",
    outline: "none",
    resize: "none",
    lineHeight: 1.55,
    marginBottom: 16,
    boxSizing: "border-box",
  },
  customSelect: {
    width: "100%",
    height: 38,
    borderRadius: 10,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 13,
    padding: "0 10px",
    color: "var(--white)",
    outline: "none",
    marginBottom: 16,
    boxSizing: "border-box",
  },
  customLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--dark-300)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "var(--font-display)",
  },
  modalSubmitBtn: {
    width: "100%",
    height: 40,
    borderRadius: 20,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(255,31,107,0.3)",
    transition: "opacity 0.2s",
  },
};
