import React, { useState, useEffect } from "react";
import {
  matchAPI,
  chatAPI,
  confessionRequestAPI,
  interactionAPI,
  profileAPI,
} from "../api";
import ProfileDetail from "../components/ProfileDetail";
import matchesStyles from "../styles/MatchesPage.module.css";
import { getUserDisplayName, getUserInitial } from "../utils/userDisplay";

// Colour palette for avatars
const COLORS = [
  "#FF1F6B",
  "#A855F7",
  "#06B6D4",
  "#F59E0B",
  "#10B981",
  "#EF4444",
];
const getColor = (i) => COLORS[i % COLORS.length];

export default function MatchesPage({ onOpenChat }) {
  const [newMatches, setNewMatches] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  // New request streams
  const [confessionRequests, setConfessionRequests] = useState([]);
  const [receivedLikes, setReceivedLikes] = useState([]);
  const [likesCount, setLikesCount] = useState(0);
  const [likesBlurred, setLikesBlurred] = useState(false);
  const [canSeeIncomingLikes, setCanSeeIncomingLikes] = useState(false);
  const [profilePreview, setProfilePreview] = useState(null);

  useEffect(() => {
    loadData();
    window.addEventListener("new_match", loadData);
    window.addEventListener("new_message", loadData);
    return () => {
      window.removeEventListener("new_match", loadData);
      window.removeEventListener("new_message", loadData);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [matchData, convData, confessionData, likesData] = await Promise.all([
        matchAPI.getMatches(),
        chatAPI.getConversations(),
        confessionRequestAPI.listRequests().catch(() => []),
        interactionAPI.getReceivedLikes().catch(() => ({ count: 0, users: [] })),
      ]);

      // Conversations with at least one message; skip deleted/unavailable partners
      const activeConversations = (convData || []).filter(
        (c) =>
          c.last_message !== null &&
          c.other_user_available !== false &&
          c.other_user?.id,
      );
      const activeConvUserIds = new Set(
        activeConversations.map((c) => c.other_user?.id).filter(Boolean),
      );

      // Active matches only; never show deleted/unavailable partners
      const allMatches = (matchData || []).filter(
        (m) => m.other_user_available !== false && m.other_user?.id,
      );
      setNewMatches(
        allMatches.filter((m) => !activeConvUserIds.has(m.other_user?.id)),
      );
      setConversations(activeConversations);
      
      setConfessionRequests(
        Array.isArray(confessionData)
          ? confessionData.filter((r) => r.status === "PENDING")
          : [],
      );

      const count = likesData?.count ?? 0;
      const rawUsers = likesData?.users || [];
      const canSee = likesData?.can_see_incoming_likes === true;
      const canViewFull =
        likesData?.can_view_full_profiles === true ||
        rawUsers.some((u) => u && u.blurred === false);
      setCanSeeIncomingLikes(canSee);
      setLikesCount(count);
      // Blur only when not permitted or server returned empty stubs (legacy)
      setLikesBlurred(
        canSee && count > 0 && (rawUsers.length === 0 || (!canViewFull && rawUsers.every((u) => u?.blurred)))
      );

      if (canSee && rawUsers.length > 0) {
        const hydrated = await Promise.all(
          rawUsers.slice(0, 30).map(async (userData) => {
            if (typeof userData === "string") {
              try {
                const p = await profileAPI.getProfile(userData);
                return { id: userData, ...p, can_direct_message: p?.can_direct_message };
              } catch {
                return { id: userData };
              }
            }
            const uid = userData?.id;
            // Discovery payload: profile_card (preferred) or profile
            const card =
              userData?.profile_card ||
              userData?.profile ||
              null;
            if (card && typeof card === "object") {
              return {
                id: uid || card.id,
                ...card,
                blurred: userData.blurred === true,
                image_url:
                  userData.image_url ||
                  card.images?.[0]?.image_url ||
                  card.avatar_detail?.image_url,
              };
            }
            if (userData?.blurred) {
              return { id: uid, blurred: true };
            }
            try {
              const p = await profileAPI.getProfile(uid);
              return { id: uid, ...p };
            } catch {
              return { id: uid };
            }
          }),
        );
        setReceivedLikes(hydrated.filter((u) => u?.id));
      } else {
        setReceivedLikes([]);
      }
    } catch (err) {
      console.error("Error loading matches details:", err);
      setConfessionRequests([]);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptConfession = async (id) => {
    try {
      const res = await confessionRequestAPI.acceptRequest(id);
      if (res.conversation_id) {
        alert("Request accepted! Starting chat.");
        loadData();
        if (onOpenChat) {
          onOpenChat({ id: res.conversation_id, conversationId: res.conversation_id });
        }
      } else if (res.error) {
        alert(res.error);
      }
    } catch {
      alert("Failed to accept request");
    }
  };

  const handleRejectConfession = async (id) => {
    try {
      await confessionRequestAPI.rejectRequest(id);
      alert("Request rejected.");
      loadData();
    } catch {
      alert("Failed to reject request");
    }
  };

  const handleRelike = async (senderId) => {
    try {
      const res = await interactionAPI.like(senderId);
      if (res.status === "match") {
        alert("It's a Match! You can now start chatting.");
        setProfilePreview(null);
        loadData();
      } else {
        alert("Liked back successfully!");
        setProfilePreview(null);
        loadData();
      }
    } catch {
      alert("Failed to like back");
    }
  };

  const openIncomingProfile = async (sender) => {
    if (!sender?.id || sender.blurred) return;
    // Prefer already-hydrated card; refresh for full public profile fields
    try {
      const p = await profileAPI.getProfile(sender.id);
      setProfilePreview({
        id: sender.id,
        ...sender,
        ...p,
        can_direct_message: p?.can_direct_message ?? sender.can_direct_message,
      });
    } catch {
      setProfilePreview(sender);
    }
  };

  const getInitial = getUserInitial;

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
  };

  return (
    <div style={styles.page} className={matchesStyles.page}>
      <div style={styles.header} className={matchesStyles.header}>
        <h1 style={styles.title}>Matches</h1>
        <p style={styles.sub}>
          {loading
            ? "Loading..."
            : `${newMatches.length} new · don't ghost them`}
        </p>
      </div>

      {/* New matches story rings */}
      {newMatches.length > 0 && (
        <div style={styles.section} className={matchesStyles.section}>
          <div style={styles.sectionLabel}>New Matches</div>
          <div style={styles.newMatchRow} className={matchesStyles.newMatchRow}>
            {newMatches.map((m, i) => (
              <div
                key={m.id}
                style={styles.newMatchItem}
                className={matchesStyles.newMatchItem}
                onClick={() => onOpenChat({ ...m.other_user, conversationId: m.conversation_id })}
              >
                <div style={styles.ring}>
                  <div style={{ ...styles.ringInner, color: getColor(i) }}>
                    {getInitial(m.other_user)}
                  </div>
                </div>
                <span style={styles.matchName}>
                  {getUserDisplayName(m.other_user)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {newMatches.length > 0 && <div style={styles.divider} />}

      {/* Incoming Requests */}
      {likesBlurred && canSeeIncomingLikes && (
        <div style={styles.section} className={matchesStyles.section}>
          <div style={styles.sectionLabel}>People who liked you</div>
          <div style={styles.premiumBlurCard}>
            <div style={styles.blurIcon}>♥</div>
            <p style={styles.blurTitle}>
              {likesCount} {likesCount === 1 ? "person likes" : "people like"} you
            </p>
            <p style={styles.blurSub}>
              Your gender + sexuality combo is allowed to see likes, but profiles
              could not be loaded. Pull to refresh.
            </p>
          </div>
        </div>
      )}

      {likesBlurred && canSeeIncomingLikes && <div style={styles.divider} />}

      {(confessionRequests.length > 0 || receivedLikes.length > 0) && (
        <div style={styles.section} className={matchesStyles.section}>
          <div style={styles.sectionLabel}>Incoming Requests</div>
          
          {confessionRequests.map((req) => (
            <div key={req.id} style={styles.requestCard} className={matchesStyles.requestCard}>
              <div style={styles.reqHeader}>
                <span style={styles.reqBadge}>Confession Chat Request 🤫</span>
                <span style={styles.reqTime}>{formatTime(req.created_at)}</span>
              </div>
              <p style={styles.reqText}>
                <strong>{getUserDisplayName(req.sender)}</strong> wants to chat
              </p>
              <p style={{ ...styles.reqText, fontSize: 12, color: "var(--dark-300)" }}>
                From your confession: "{req.confession_text}"
              </p>
              {req.message ? (
                <p style={{ ...styles.reqText, marginTop: 6 }}>
                  Their message: "{req.message}"
                </p>
              ) : null}
              <div style={styles.reqActions}>
                <button
                  style={{ ...styles.reqBtn, ...styles.acceptReqBtn }}
                  onClick={() => handleAcceptConfession(req.id)}
                >
                  Accept
                </button>
                <button
                  style={{ ...styles.reqBtn, ...styles.rejectReqBtn }}
                  onClick={() => handleRejectConfession(req.id)}
                >
                  Ignore
                </button>
              </div>
            </div>
          ))}

          {receivedLikes.map((sender) => (
            <div key={sender.id} style={styles.requestCard}>
              <div style={styles.reqHeader}>
                <span
                  style={{
                    ...styles.reqBadge,
                    background: "var(--pink-dim)",
                    color: "var(--pink-soft)",
                    border: "0.5px solid var(--pink)",
                  }}
                >
                  Incoming Like ♥
                </span>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
                {(sender.image_url || sender.images?.[0]?.image_url) && (
                  <img
                    src={sender.image_url || sender.images[0].image_url}
                    alt=""
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid var(--pink)",
                    }}
                  />
                )}
                <p style={{ ...styles.reqText, margin: 0 }}>
                  <strong>{getUserDisplayName(sender)}</strong>
                  {sender.age ? `, ${sender.age}` : ""} liked your profile!
                </p>
              </div>
              <div style={styles.reqActions}>
                <button
                  style={{ ...styles.reqBtn, ...styles.acceptReqBtn }}
                  onClick={() => handleRelike(sender.id)}
                >
                  Like Back & Match
                </button>
                <button
                  style={{ ...styles.reqBtn, ...styles.rejectReqBtn }}
                  onClick={() => openIncomingProfile(sender)}
                >
                  View full profile
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {(confessionRequests.length > 0 || receivedLikes.length > 0) && <div style={styles.divider} />}

      {profilePreview && (
        <ProfileDetail
          profile={profilePreview}
          onClose={() => setProfilePreview(null)}
          onLike={() => {
            // ProfileDetail already sent the like; refresh matches/likes
            setProfilePreview(null);
            loadData();
          }}
        />
      )}

      {/* Conversations */}
      <div style={styles.section} className={matchesStyles.section}>
        <div style={styles.sectionLabel}>Conversations</div>
        {loading ? (
          [1, 2, 3].map((i) => <div key={i} style={styles.skeleton} />)
        ) : conversations.length === 0 ? (
          <p style={styles.emptyNote} className={matchesStyles.emptyNote}>
            No conversations yet — like someone to start chatting!
          </p>
        ) : (
          <div style={styles.convoList} className={matchesStyles.convoList}>
            {conversations.map((c, i) => {
              const user = c.other_user || {};
              const lastMsg = c.last_message;
              const unread =
                lastMsg && !lastMsg.is_seen && !lastMsg.is_me ? 1 : 0;
              return (
                <React.Fragment key={c.id}>
                  <div
                    style={styles.convoItem}
                    onClick={() =>
                      onOpenChat({ ...user, conversationId: c.id })
                    }
                  >
                    <div
                      style={{
                        ...styles.av,
                        background: getColor(i) + "33",
                        color: getColor(i),
                      }}
                    >
                      {getInitial(user)}
                    </div>
                    <div style={styles.convoBody}>
                      <div style={styles.convoName}>
                        {getUserDisplayName(user)}
                      </div>
                      <div style={styles.convoMsg}>
                        {lastMsg?.content?.text || "Say hello 👋"}
                      </div>
                    </div>
                    <div style={styles.convoBadgeCol}>
                      <span style={styles.convoTime}>
                        {formatTime(c.last_message_at)}
                      </span>
                      {unread > 0 && <div style={styles.badge}>{unread}</div>}
                    </div>
                  </div>
                  {i < conversations.length - 1 && (
                    <div style={styles.convoDiv} className={matchesStyles.divider} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: { flex: 1, overflowY: "auto", padding: "0 0 40px" },
  header: {
    padding: "24px 32px 16px",
    borderBottom: "0.5px solid var(--dark-700)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 700,
    color: "var(--white)",
  },
  sub: { fontSize: 12, color: "var(--pink-soft)", marginTop: 4 },
  section: { padding: "20px 32px" },
  sectionLabel: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--dark-300)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: "var(--font-display)",
    marginBottom: 14,
  },
  newMatchRow: {
    display: "flex",
    gap: 20,
    overflowX: "auto",
    paddingBottom: 4,
  },
  newMatchItem: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 6,
    flexShrink: 0,
    cursor: "pointer",
  },
  ring: {
    width: 60,
    height: 60,
    borderRadius: "50%",
    padding: 2,
    background: "conic-gradient(var(--pink) 0%, #A855F7 50%, var(--pink) 100%)",
  },
  ringInner: {
    width: "100%",
    height: "100%",
    borderRadius: "50%",
    background: "var(--dark-700)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    border: "3px solid var(--dark-800)",
  },
  matchName: { fontSize: 11, color: "var(--dark-100)" },
  divider: { height: "0.5px", background: "var(--dark-700)", margin: "0 32px" },
  skeleton: {
    height: 64,
    borderRadius: 12,
    background: "var(--dark-700)",
    opacity: 0.4,
    marginBottom: 8,
  },
  emptyNote: {
    fontSize: 13,
    color: "var(--dark-400)",
    textAlign: "center",
    padding: "40px 0",
  },
  convoList: {
    background: "var(--dark-800)",
    borderRadius: 16,
    border: "0.5px solid var(--dark-600)",
    overflow: "hidden",
  },
  convoItem: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    cursor: "pointer",
  },
  av: {
    width: 48,
    height: 48,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    flexShrink: 0,
  },
  convoBody: { flex: 1, minWidth: 0 },
  convoName: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 600,
    color: "var(--white)",
  },
  convoMsg: {
    fontSize: 12,
    color: "var(--dark-200)",
    marginTop: 3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  convoBadgeCol: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 5,
    flexShrink: 0,
  },
  convoTime: { fontSize: 11, color: "var(--dark-300)" },
  badge: {
    width: 20,
    height: 20,
    borderRadius: "50%",
    background: "var(--pink)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 10,
    color: "#fff",
    fontWeight: 700,
  },
  convoDiv: {
    height: "0.5px",
    background: "var(--dark-700)",
    margin: "0 18px",
  },
  requestCard: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "16px",
    marginBottom: 12,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  reqHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  reqBadge: {
    fontSize: 10,
    fontWeight: 700,
    background: "rgba(0,212,170,0.1)",
    color: "var(--teal)",
    border: "0.5px solid rgba(0,212,170,0.25)",
    padding: "4px 10px",
    borderRadius: 20,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  reqTime: {
    fontSize: 11,
    color: "var(--dark-400)",
  },
  reqText: {
    fontSize: 14,
    color: "var(--white)",
    lineHeight: 1.6,
    margin: 0,
    fontStyle: "italic",
  },
  reqActions: {
    display: "flex",
    gap: 10,
  },
  reqBtn: {
    padding: "6px 16px",
    borderRadius: 16,
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    border: "none",
    fontFamily: "var(--font-display)",
  },
  acceptReqBtn: {
    background: "var(--pink)",
    color: "#fff",
    boxShadow: "0 2px 10px rgba(255,31,107,0.2)",
  },
  rejectReqBtn: {
    background: "var(--dark-700)",
    color: "var(--dark-100)",
    border: "0.5px solid var(--dark-500)",
  },
  premiumBlurCard: {
    background: "var(--dark-800)",
    border: "0.5px solid rgba(255,31,107,0.25)",
    borderRadius: 16,
    padding: "28px 24px",
    textAlign: "center",
  },
  blurIcon: {
    fontSize: 36,
    marginBottom: 10,
    filter: "blur(4px)",
  },
  blurTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--white)",
    margin: "0 0 8px",
  },
  blurSub: {
    fontSize: 13,
    color: "var(--dark-300)",
    margin: 0,
    lineHeight: 1.5,
  },
};
