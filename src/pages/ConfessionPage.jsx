// src/pages/ConfessionPage.jsx
import React, { useState, useEffect } from "react";
import { socialAPI, profileAPI, geoAPI, moderationAPI } from "../api";
import confessionStyles from "../styles/ConfessionPage.module.css";

/**
 * Browser GPS — only used when posting if profile has no saved location.
 * NOT used for loading the confession feed (timeouts are browser/OS, not API).
 */
const getCoordinates = (timeoutMs = 8000) => {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        resolve({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
        });
      },
      (err) => reject(err),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 600000 }
    );
  });
};

const MOOD_COLORS = {
  LONELY: "#3B82F6",
  CURIOUS: "#06B6D4",
  REGRET: "#8B5CF6",
  HAPPY: "#F59E0B",
  ANXIOUS: "#EF4444",
  HORNY: "#FF1F6B",
  GRATEFUL: "#10B981",
  DARK_SECRET: "#6B7280",
  FANTASY: "#EC4899",
  TABOO: "#F43F5E",
  GUILT: "#64748B",
  KINK: "#D946EF",
};



function timeLeft(mins) {
  if (mins >= 60) return `${Math.floor(mins / 60)}h left`;
  return `${mins}m left`;
}

function formatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString();
}

export default function ConfessionPage() {
  const [confessions, setConfessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [text, setText] = useState("");
  const [moodTag, setMoodTag] = useState("");
  const [moodTags, setMoodTags] = useState([]);
  const [posting, setPosting] = useState(false);
  const [toast, setToast] = useState("");
  const [related, setRelated] = useState(new Set());
  const [requestedConfessions, setRequestedConfessions] = useState(new Set());
  const [requestingChatId, setRequestingChatId] = useState(null);
  const [chatNote, setChatNote] = useState("");
  const [sendingRequest, setSendingRequest] = useState(false);
  const [coords, setCoords] = useState(null);
  const [profileLocationName, setProfileLocationName] = useState("");
  const [whisperModalId, setWhisperModalId] = useState(null);
  const [whispers, setWhispers] = useState([]);
  const [whisperText, setWhisperText] = useState("");
  const [loadingWhispers, setLoadingWhispers] = useState(false);
  const [repostModalId, setRepostModalId] = useState(null);
  const [repostThought, setRepostThought] = useState("");
  const [reposting, setReposting] = useState(false);

  const [reportModalId, setReportModalId] = useState(null);
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);

  useEffect(() => {
    loadFeed();
    loadMoodTags();
  }, []);

  const loadMoodTags = async () => {
    try {
      const tags = await socialAPI.getMoodTags();
      setMoodTags(tags);
      if (tags.length > 0) {
        setMoodTag(tags[0].value);
      }
    } catch (err) {
      console.error("Failed to load mood tags", err);
    }
  };

  const loadFeed = async () => {
    setLoading(true);
    let detectedCoords = null;
    let locationName = "";

    // Use profile location only — never call browser GPS for feed load.
    // GPS timeout (code 3) is a browser/OS issue, not the backend.
    try {
      const profile = await profileAPI.getMyProfile();
      if (profile && profile.latitude && profile.longitude) {
        detectedCoords = {
          lat: parseFloat(profile.latitude),
          lon: parseFloat(profile.longitude),
        };
        locationName = profile.city || "";
      }
    } catch (err) {
      console.error("Profile load failed:", err);
    }

    setCoords(detectedCoords);
    setProfileLocationName(locationName);

    try {
      const latParam = detectedCoords ? detectedCoords.lat : "";
      const lonParam = detectedCoords ? detectedCoords.lon : "";
      let data = await socialAPI.getFeed(latParam, lonParam);
      let results = Array.isArray(data) ? data : data.results || [];
      // Fallback to global feed if location-scoped list is empty
      if (!results.length && (latParam || lonParam)) {
        data = await socialAPI.getFeed("", "");
        results = Array.isArray(data) ? data : data.results || [];
      }
      setConfessions(results);
    } catch (err) {
      console.error("Error loading confessions:", err);
      try {
        const data = await socialAPI.getFeed("", "");
        setConfessions(Array.isArray(data) ? data : data.results || []);
      } catch {
        setConfessions([]);
      }
    } finally {
      setLoading(false);
    }
  };

  /** Resolve coords for posting only (profile first, then GPS if needed). */
  const resolveCoordsForPost = async () => {
    if (coords?.lat != null && coords?.lon != null) {
      return coords;
    }
    try {
      const profile = await profileAPI.getMyProfile();
      if (profile?.latitude && profile?.longitude) {
        const c = {
          lat: parseFloat(profile.latitude),
          lon: parseFloat(profile.longitude),
        };
        setCoords(c);
        if (profile.city) setProfileLocationName(profile.city);
        return c;
      }
    } catch {}
    try {
      const gps = await getCoordinates(8000);
      setCoords(gps);
      return gps;
    } catch {
      return null;
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  const handleRelate = async (id) => {
    if (related.has(id)) return;
    setRelated((prev) => new Set([...prev, id]));
    setConfessions((cs) =>
      cs.map((c) =>
        c.id === id ? { ...c, relate_count: (c.relate_count || 0) + 1 } : c,
      ),
    );
    try {
      await socialAPI.relate(id);
    } catch {}
    showToast("❤️ Relatable!");
  };

  const triggerChatRequest = (id) => {
    setRequestingChatId(id);
    setChatNote("");
  };

  const handleChatRequest = async (id, note) => {
    try {
      await socialAPI.chatRequest(id, note);
      setRequestedConfessions((prev) => new Set([...prev, id]));
      showToast("✉️ Chat request sent!");
      setRequestingChatId(null);
      setChatNote("");
    } catch (err) {
      console.error("Error sending chat request:", err);
      const errMsg = err.message || "Failed to send chat request";
      showToast(`❌ ${errMsg}`);
    }
  };

  const submitChatRequest = async () => {
    if (chatNote.length < 10 || chatNote.length > 300) {
      showToast("Note must be between 10 and 300 characters");
      return;
    }
    setSendingRequest(true);
    try {
      await handleChatRequest(requestingChatId, chatNote);
    } finally {
      setSendingRequest(false);
    }
  };

  const openWhispers = async (id) => {
    setWhisperModalId(id);
    setWhisperText("");
    setLoadingWhispers(true);
    try {
      const data = await socialAPI.getWhispers(id);
      setWhispers(Array.isArray(data) ? data : data.results || []);
    } catch {
      setWhispers([]);
    } finally {
      setLoadingWhispers(false);
    }
  };

  const submitWhisper = async () => {
    if (whisperText.trim().length < 5) {
      showToast("Whisper must be at least 5 characters");
      return;
    }
    try {
      await socialAPI.addWhisper(whisperModalId, whisperText.trim());
      showToast("Whisper sent 🤫");
      setWhisperText("");
      const data = await socialAPI.getWhispers(whisperModalId);
      setWhispers(Array.isArray(data) ? data : data.results || []);
    } catch (err) {
      showToast(err.message || "Failed to send whisper");
    }
  };

  const openReportModal = (id) => {
    setReportModalId(id);
    setReportReason("SPAM");
    setReportDescription("");
  };

  const submitReport = async () => {
    if (reportReason === "OTHER" && !reportDescription.trim()) {
      showToast("Please provide details for the report");
      return;
    }
    setSubmittingReport(true);
    try {
      await moderationAPI.submitReport({
        targetId: reportModalId,
        reason: reportReason,
        description: reportDescription.trim(),
        targetType: "CONFESSION"
      });
      showToast("Report submitted successfully");
      setReportModalId(null);
      setReportDescription("");
    } catch (err) {
      showToast("Failed to submit report");
    } finally {
      setSubmittingReport(false);
    }
  };

  const handleRepost = async () => {
    if (!repostModalId) return;
    setReposting(true);
    try {
      await socialAPI.repost(repostModalId, repostThought.trim() || undefined);
      showToast("Reposted ✓");
      setRepostModalId(null);
      setRepostThought("");
      loadFeed();
    } catch (err) {
      showToast(err.message || "Failed to repost");
    } finally {
      setReposting(false);
    }
  };

  const handlePost = async () => {
    if (!text.trim() || text.length < 30) {
      showToast("Write at least 30 characters");
      return;
    }
    setPosting(true);
    try {
      const postCoords = await resolveCoordsForPost();
      if (!postCoords?.lat || !postCoords?.lon) {
        showToast(
          "Location required to post. Enable GPS or save location on your profile."
        );
        return;
      }
      await socialAPI.post({
        text: text.trim(),
        mood_tag: moodTag,
        language: "en",
        latitude: parseFloat(Number(postCoords.lat).toFixed(6)),
        longitude: parseFloat(Number(postCoords.lon).toFixed(6)),
      });
      showToast("✅ Confession posted!");
      setText("");
      setComposing(false);
      setTimeout(loadFeed, 800);
    } catch (err) {
      console.error("Error posting confession:", err);
      const errMsg = err.message || "Failed to post confession";
      showToast(`❌ ${errMsg}`);
    } finally {
      setPosting(false);
    }
  };

  return (
    <div style={s.page} className={confessionStyles.page}>
      {/* Header */}
      <div style={s.header} className={confessionStyles.header}>
        <div>
          <h1 style={s.title}>Confession Wall</h1>
          <p style={s.sub}>
            Anonymous · {profileLocationName ? `City-wide (${profileLocationName})` : "Location not detected (Global feed)"} · 24h auto-delete
          </p>
        </div>
        <div style={s.headerRight} className={confessionStyles.headerRight}>
          <div style={s.filters} className={confessionStyles.filters}>
            {['My City', '10km', '50km', '100km'].map((f) => (
              <button key={f} style={s.filterBtn}>
                {f}
              </button>
            ))}
          </div>
          <button style={s.composeBtn} className={confessionStyles.composeBtn} onClick={() => setComposing(true)}>
            ✍ Confess
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Compose modal */}
      {composing && (
        <>
          <div style={s.backdrop} onClick={() => setComposing(false)} />
          <div style={s.modal} className={confessionStyles.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Drop your confession 🤫</h3>
              <button style={s.closeBtn} onClick={() => setComposing(false)}>
                ✕
              </button>
            </div>

            <textarea
              id="confession-text"
              name="confession-text"
              autoComplete="off"
              style={s.textarea}
              className={confessionStyles.textarea}
              placeholder="No names, no photos — just vibes. Min 30, Max 280 chars."
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 280))}
              autoFocus
            />
            <div style={{
              ...s.charCount,
              color: text.length < 30 ? "#EF4444" : "var(--dark-400)",
            }}>
              {text.length < 30 ? `Min 30 chars required (${text.length}/280)` : `${text.length}/280`}
            </div>

            <div style={s.moodRow}>
              <span style={s.moodLabel}>Mood:</span>
              {moodTags.map((t) => {
                const m = t.value;
                const label = t.label;
                const color = MOOD_COLORS[m] || "#6B7280";
                return (
                  <button
                    key={m}
                    onClick={() => setMoodTag(m)}
                    style={{
                      ...s.moodChip,
                      background:
                        moodTag === m ? color + "33" : "var(--dark-700)",
                      border:
                        moodTag === m
                          ? `1px solid ${color}`
                          : "0.5px solid var(--dark-500)",
                      color: moodTag === m ? color : "var(--dark-200)",
                    }}
                  >
                    {label.toLowerCase()}
                  </button>
                );
              })}
            </div>

            <p style={s.warning}>
              No contact info, no links, no explicit content.
            </p>

            <button
              style={{
                ...s.postBtn,
                opacity: posting || text.length < 30 ? 0.6 : 1,
              }}
              onClick={handlePost}
              disabled={posting || text.length < 30}
            >
              {posting ? "Posting..." : "Post anonymously →"}
            </button>
          </div>
        </>
      )}

      {/* Feed */}
      <div style={s.feed} className={confessionStyles.feed}>
        {loading ? (
          [1, 2, 3, 4].map((i) => <div key={i} style={s.skeleton} />)
        ) : confessions.length === 0 ? (
          <div style={s.empty}>
            <div style={{ fontSize: 48 }}>🤫</div>
            <p style={{ color: "var(--dark-300)", marginTop: 12 }}>
              No confessions nearby. Be the first.
            </p>
            <button style={s.composeBtn} onClick={() => setComposing(true)}>
              Write one
            </button>
          </div>
        ) : (
          confessions.map((c) => {
            const color = MOOD_COLORS[c.mood_tag] || "#6B7280";
            const hasRelated = related.has(c.id);

            const getGenderEmoji = (gender) => {
              if (!gender) return "👤";
              const g = gender.toLowerCase();
              if (g.includes("female") || g.includes("woman")) return "👩";
              if (g.includes("male") || g.includes("man")) return "👨";
              return "👤";
            };

            const userMeta = [];
            if (c.user_gender) userMeta.push(`${getGenderEmoji(c.user_gender)} ${c.user_gender}`);
            if (c.user_sexuality) userMeta.push(`✨ ${c.user_sexuality}`);
            if (c.user_age) userMeta.push(`🎂 ${c.user_age}`);
            if (c.created_at) userMeta.push(`🕒 ${formatTime(c.created_at)}`);
            const metaString = userMeta.join("  ·  ");

            return (
              <div key={c.id} style={s.card}>
                {/* Top row */}
                <div style={s.cardTop}>
                  <span
                    style={{
                      ...s.moodBadge,
                      background: color + "22",
                      color,
                      border: `0.5px solid ${color}55`,
                    }}
                  >
                    {(c.mood_tag || "RANDOM").replace('_', ' ').toLowerCase()}
                  </span>
                  <span style={s.timeLeft}>
                    {timeLeft(c.time_remaining_min || 60)}
                  </span>
                </div>

                {/* User metadata row */}
                {metaString && (
                  <div style={s.userMeta}>
                    {metaString}
                  </div>
                )}

                {/* Text */}
                <p style={s.confText}>"{c.text}"</p>

                {/* Author badge */}
                {c.is_author && <span style={s.authorBadge}>✎ yours</span>}

                {/* Actions */}
                <div style={s.cardActions}>
                  <button
                    style={{
                      ...s.relateBtn,
                      background: hasRelated ? color + "22" : "var(--dark-700)",
                      color: hasRelated ? color : "var(--dark-300)",
                      border: hasRelated
                        ? `0.5px solid ${color}`
                        : "0.5px solid var(--dark-500)",
                    }}
                    onClick={() => handleRelate(c.id)}
                  >
                    {hasRelated ? "❤️" : "🤍"} {c.relate_count || 0} relate
                  </button>
                  <button
                    style={s.chatReqBtn}
                    onClick={() => openWhispers(c.id)}
                  >
                    💭 {c.whisper_count || 0}
                  </button>
                  {!c.is_author && (
                    <>
                      <button
                        style={{
                          ...s.chatReqBtn,
                          opacity:
                            c.has_requested_chat || requestedConfessions.has(c.id)
                              ? 0.6
                              : 1,
                        }}
                        onClick={() =>
                          !(c.has_requested_chat || requestedConfessions.has(c.id)) &&
                          triggerChatRequest(c.id)
                        }
                        disabled={
                          c.has_requested_chat || requestedConfessions.has(c.id)
                        }
                      >
                        {c.has_requested_chat || requestedConfessions.has(c.id)
                          ? "✉️ Requested"
                          : "💬 Chat"}
                      </button>
                      <button
                        style={s.chatReqBtn}
                        onClick={() => {
                          setRepostModalId(c.id);
                          setRepostThought("");
                        }}
                      >
                        ↻ Repost
                      </button>
                    </>
                  )}
                  <button
                    style={s.reportBtn}
                    onClick={() => openReportModal(c.id)}
                  >
                    ⚑
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Whispers modal */}
      {whisperModalId && (
        <>
          <div style={s.backdrop} onClick={() => setWhisperModalId(null)} />
          <div style={s.modal} className={confessionStyles.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Whispers 🤫</h3>
              <button style={s.closeBtn} onClick={() => setWhisperModalId(null)}>
                ✕
              </button>
            </div>
            {loadingWhispers ? (
              <p style={{ color: "var(--dark-300)", fontSize: 13 }}>Loading…</p>
            ) : whispers.length === 0 ? (
              <p style={{ color: "var(--dark-300)", fontSize: 13 }}>
                No whispers yet. Be the first.
              </p>
            ) : (
              <div style={s.whisperList}>
                {whispers.map((w) => (
                  <div key={w.id} style={s.whisperItem}>
                    <p style={s.whisperText}>{w.text}</p>
                    <span style={s.whisperMeta}>
                      {w.is_anonymous ? "Anonymous" : "Named"} ·{" "}
                      {formatTime(w.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <textarea
              style={{ ...s.textarea, height: 72, marginTop: 12 }}
              placeholder="Add an anonymous whisper (min 5 chars)…"
              value={whisperText}
              onChange={(e) => setWhisperText(e.target.value.slice(0, 200))}
            />
            <button
              style={{
                ...s.postBtn,
                marginTop: 12,
                opacity: whisperText.trim().length < 5 ? 0.6 : 1,
              }}
              onClick={submitWhisper}
              disabled={whisperText.trim().length < 5}
            >
              Send whisper
            </button>
          </div>
        </>
      )}

      {/* Repost modal */}
      {repostModalId && (
        <>
          <div style={s.backdrop} onClick={() => setRepostModalId(null)} />
          <div style={s.modal} className={confessionStyles.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Repost ↻</h3>
              <button style={s.closeBtn} onClick={() => setRepostModalId(null)}>
                ✕
              </button>
            </div>
            <textarea
              style={s.textarea}
              placeholder="Optional thought (max 300 chars)…"
              value={repostThought}
              onChange={(e) => setRepostThought(e.target.value.slice(0, 300))}
            />
            <button
              style={{
                ...s.postBtn,
                opacity: reposting ? 0.6 : 1,
              }}
              onClick={handleRepost}
              disabled={reposting}
            >
              {reposting ? "Reposting…" : "Repost confession"}
            </button>
          </div>
        </>
      )}

      {/* Report modal */}
      {reportModalId && (
        <>
          <div style={s.backdrop} onClick={() => setReportModalId(null)} />
          <div style={s.modal} className={confessionStyles.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Report Confession ⚑</h3>
              <button style={s.closeBtn} onClick={() => setReportModalId(null)}>
                ✕
              </button>
            </div>
            <label style={{...s.moodLabel, marginTop: 12, display: 'block', marginBottom: 6}}>Reason</label>
            <select
              style={{...s.textarea, height: 'auto', padding: '10px 12px', marginBottom: 16}}
              value={reportReason}
              onChange={(e) => setReportReason(e.target.value)}
            >
              <option value="SPAM">Spam</option>
              <option value="HARASSMENT">Harassment</option>
              <option value="INAPPROPRIATE">Inappropriate Content</option>
              <option value="OTHER">Other (specify below)</option>
            </select>
            <label style={{...s.moodLabel, display: 'block', marginBottom: 6}}>Description</label>
            <textarea
              style={s.textarea}
              placeholder="Provide more context..."
              value={reportDescription}
              onChange={(e) => setReportDescription(e.target.value)}
            />
            <button
              style={{
                ...s.postBtn,
                background: "#EF4444",
                marginTop: 16,
                opacity: submittingReport ? 0.6 : 1,
              }}
              onClick={submitReport}
              disabled={submittingReport}
            >
              {submittingReport ? "Reporting…" : "Submit Report"}
            </button>
          </div>
        </>
      )}

      {/* Chat Request Note modal */}
      {requestingChatId && (
        <>
          <div style={s.backdrop} onClick={() => setRequestingChatId(null)} />
          <div style={s.modal} className={confessionStyles.modal}>
            <div style={s.modalHeader}>
              <h3 style={s.modalTitle}>Send Chat Request 💬</h3>
              <button style={s.closeBtn} onClick={() => setRequestingChatId(null)}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: 13, color: "var(--dark-300)", marginBottom: 12 }}>
              Add a personal note to connect. Make it interesting! (Min 10, Max 300 chars)
            </p>

            <textarea
              style={s.textarea}
              placeholder="Write a message (min 10, max 300 characters)..."
              value={chatNote}
              onChange={(e) => setChatNote(e.target.value.slice(0, 300))}
              autoFocus
            />
            <div style={{
              ...s.charCount,
              color: chatNote.length < 10 ? "#EF4444" : "var(--dark-400)",
              fontSize: 11,
              marginTop: 4,
              textAlign: "right",
            }}>
              {chatNote.length < 10 ? `Min 10 chars required (${chatNote.length}/300)` : `${chatNote.length}/300`}
            </div>

            <button
              style={{
                ...s.postBtn,
                marginTop: 16,
                opacity: sendingRequest || chatNote.length < 10 ? 0.6 : 1,
              }}
              onClick={submitChatRequest}
              disabled={sendingRequest || chatNote.length < 10}
            >
              {sendingRequest ? "Sending..." : "Send Request ✉️"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 28px 16px",
    borderBottom: "0.5px solid var(--dark-700)",
    flexShrink: 0,
    flexWrap: "wrap",
    gap: 12,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 700,
    color: "var(--white)",
    margin: 0,
  },
  sub: { fontSize: 12, color: "var(--dark-400)", marginTop: 4 },
  headerRight: { display: "flex", alignItems: "center", gap: 10 },
  filters: { display: "flex", gap: 6 },
  filterBtn: {
    padding: "6px 12px",
    borderRadius: 20,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    fontSize: 11,
    cursor: "pointer",
  },
  composeBtn: {
    padding: "9px 18px",
    borderRadius: 24,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    boxShadow: "0 4px 16px rgba(255,31,107,0.3)",
  },
  toast: {
    position: "absolute",
    top: 80,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--dark-600)",
    border: "0.5px solid var(--dark-400)",
    borderRadius: 24,
    padding: "10px 24px",
    fontSize: 13,
    color: "var(--white)",
    fontWeight: 600,
    zIndex: 100,
    whiteSpace: "nowrap",
  },
  feed: {
    flex: 1,
    overflowY: "auto",
    padding: "20px 28px",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
    gap: 14,
    alignContent: "start",
  },
  skeleton: {
    height: 140,
    borderRadius: 16,
    background: "var(--dark-700)",
    opacity: 0.4,
  },
  empty: {
    gridColumn: "1/-1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 0",
    gap: 12,
  },
  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "16px 18px",
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  cardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  moodBadge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "3px 10px",
    borderRadius: 99,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  timeLeft: { fontSize: 11, color: "var(--dark-400)" },
  userMeta: {
    fontSize: 11,
    color: "var(--dark-300)",
    display: "flex",
    flexWrap: "wrap",
    gap: "4px 8px",
    marginTop: -4,
    marginBottom: 4,
  },
  confText: {
    fontSize: 15,
    color: "var(--white)",
    lineHeight: 1.7,
    margin: 0,
    fontStyle: "italic",
  },
  authorBadge: {
    fontSize: 10,
    color: "var(--pink-soft)",
    background: "var(--pink-dim)",
    padding: "2px 8px",
    borderRadius: 99,
    alignSelf: "flex-start",
  },
  cardActions: { display: "flex", gap: 8, alignItems: "center" },
  relateBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 99,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  chatReqBtn: {
    fontSize: 12,
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: 99,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    cursor: "pointer",
  },
  reportBtn: {
    fontSize: 13,
    padding: "6px 10px",
    borderRadius: 99,
    background: "none",
    border: "0.5px solid var(--dark-600)",
    color: "var(--dark-500)",
    cursor: "pointer",
    marginLeft: "auto",
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    backdropFilter: "blur(2px)",
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: "90%",
    maxWidth: 500,
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
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 16,
    cursor: "pointer",
  },
  textarea: {
    width: "100%",
    height: 120,
    borderRadius: 12,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 14,
    padding: "12px 14px",
    color: "var(--white)",
    outline: "none",
    resize: "none",
    lineHeight: 1.6,
    boxSizing: "border-box",
  },
  charCount: {
    textAlign: "right",
    fontSize: 11,
    color: "var(--dark-400)",
    marginTop: 4,
  },
  moodRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "center",
    margin: "12px 0",
  },
  moodLabel: { fontSize: 11, color: "var(--dark-400)", fontWeight: 500 },
  moodChip: {
    fontSize: 11,
    fontWeight: 500,
    padding: "4px 10px",
    borderRadius: 99,
    cursor: "pointer",
    transition: "all 0.15s",
  },
  warning: { fontSize: 11, color: "var(--dark-500)", marginBottom: 14 },
  whisperList: {
    maxHeight: 200,
    overflowY: "auto",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  },
  whisperItem: {
    background: "var(--dark-700)",
    borderRadius: 10,
    padding: "10px 12px",
  },
  whisperText: {
    fontSize: 13,
    color: "var(--white)",
    margin: "0 0 4px",
    lineHeight: 1.5,
  },
  whisperMeta: {
    fontSize: 10,
    color: "var(--dark-400)",
  },
  postBtn: {
    width: "100%",
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
};
