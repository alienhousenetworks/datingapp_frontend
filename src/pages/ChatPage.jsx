import React, { useState, useEffect } from "react";
import ChatWindow from "../components/ChatWindow";
import { chatAPI } from "../api";
import chatStyles from "../styles/ChatPage.module.css";
import { getUserDisplayName, getUserInitial } from "../utils/userDisplay";

const COLORS = [
  "#FF1F6B",
  "#A855F7",
  "#06B6D4",
  "#F59E0B",
  "#10B981",
  "#EF4444",
];
const getColor = (i) => COLORS[i % COLORS.length];

export default function ChatPage({ initialMatch }) {
  const [conversations, setConversations] = useState([]);
  const [activeConv, setActiveConv] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadConversations = async (keepActive = true) => {
    try {
      const data = await chatAPI.getConversations();
      const convs = data || [];
      setConversations(convs);
      
      if (!keepActive) {
        if (initialMatch?.conversationId) {
          const found = convs.find((c) => c.id === initialMatch.conversationId);
          setActiveConv(found || convs[0] || null);
        } else {
          setActiveConv(convs[0] || null);
        }
      } else {
        setActiveConv((prevActive) => {
          if (!prevActive) {
            if (initialMatch?.conversationId) {
              const found = convs.find((c) => c.id === initialMatch.conversationId);
              return found || convs[0] || null;
            }
            return convs[0] || null;
          }
          const updated = convs.find((c) => c.id === prevActive.id);
          // If the conversation no longer exists in the API response (e.g. unmatched/deleted),
          // clear activeConv instead of keeping the stale reference. Keeping it would cause
          // ChatWindow to open a WS to a room the user is no longer a participant of (→ 403 loop).
          return updated || null;
        });
      }
    } catch {
      setConversations([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations(false);
  }, [initialMatch?.conversationId]);

  useEffect(() => {
    const handleNewMessage = () => {
      loadConversations(true);
    };
    window.addEventListener("new_message", handleNewMessage);
    return () => {
      window.removeEventListener("new_message", handleNewMessage);
    };
  }, []);

  const handleDeleteConversation = async () => {
    await loadConversations(false);
  };

  const getInitial = getUserInitial;

  const formatTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    const diff = (new Date() - d) / 1000;
    if (diff < 3600) return `${Math.floor(diff / 60)}m`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
    return d.toLocaleDateString();
  };

  return (
    <div style={styles.page} className={chatStyles.page}>
      {/* Sidebar */}
      <div style={styles.sidebar} className={chatStyles.sidebar}>
        <div style={styles.sidebarHeader} className={chatStyles.sidebarHeader}>
          <span style={styles.sidebarTitle}>Messages</span>
          <span style={styles.newCount}>{conversations.length} chats</span>
        </div>
        <div style={styles.convoList} className={chatStyles.convoList}>
          {loading ? (
            [1, 2, 3].map((i) => <div key={i} style={styles.skeleton} />)
          ) : conversations.length === 0 ? (
            <p style={styles.emptyNote}>No chats yet</p>
          ) : (
            conversations.map((c, i) => {
              const active = activeConv?.id === c.id;
              const user = c.other_user || {};
              return (
                <React.Fragment key={c.id}>
                  <div
                    style={{
                      ...styles.convoItem,
                      background: active ? "var(--pink-dim)" : "transparent",
                      borderLeft: active
                        ? "2px solid var(--pink)"
                        : "2px solid transparent",
                    }}
                    className={chatStyles.convoItem}
                    onClick={() => setActiveConv(c)}
                  >
                    <div
                      style={{
                        ...styles.av,
                        background: getColor(i) + "22",
                        color: getColor(i),
                      }}
                    >
                      {getInitial(user)}
                    </div>
                    <div style={styles.convoBody}>
                      <div
                        style={{
                          ...styles.convoName,
                          color: active ? "var(--pink-soft)" : "var(--white)",
                        }}
                      >
                        {getUserDisplayName(user)}
                      </div>
                      <div style={styles.convoMsg}>
                        {c.last_message?.content?.text || "Say hello 👋"}
                      </div>
                    </div>
                    <div style={styles.meta}>
                      <span style={styles.time}>
                        {formatTime(c.last_message_at)}
                      </span>
                    </div>
                  </div>
                  {i < conversations.length - 1 && (
                    <div style={styles.div} className={chatStyles.separator} />
                  )}
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>

      {/* Chat window */}
      <ChatWindow conversation={activeConv} onDeleteConversation={handleDeleteConversation} />
    </div>
  );
}

const styles = {
  page: { flex: 1, display: "flex", overflow: "hidden" },
  sidebar: {
    width: 280,
    background: "var(--dark-800)",
    borderRight: "0.5px solid var(--dark-600)",
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
  },
  sidebarHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "20px 18px 14px",
    borderBottom: "0.5px solid var(--dark-600)",
  },
  sidebarTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--white)",
  },
  newCount: {
    fontSize: 11,
    color: "var(--pink-soft)",
    background: "var(--pink-dim)",
    padding: "3px 10px",
    borderRadius: 20,
    border: "0.5px solid rgba(255,31,107,0.25)",
  },
  convoList: { flex: 1, overflowY: "auto" },
  skeleton: {
    height: 56,
    borderRadius: 8,
    background: "var(--dark-700)",
    opacity: 0.4,
    margin: "8px 12px",
  },
  emptyNote: {
    fontSize: 12,
    color: "var(--dark-400)",
    textAlign: "center",
    padding: "32px 16px",
  },
  convoItem: {
    display: "flex",
    alignItems: "center",
    gap: 11,
    padding: "12px 16px",
    cursor: "pointer",
    transition: "background 0.15s",
    borderLeft: "2px solid transparent",
  },
  av: {
    width: 42,
    height: 42,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 16,
    flexShrink: 0,
  },
  convoBody: { flex: 1, minWidth: 0 },
  convoName: {
    fontFamily: "var(--font-display)",
    fontSize: 14,
    fontWeight: 600,
  },
  convoMsg: {
    fontSize: 11,
    color: "var(--dark-200)",
    marginTop: 3,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  meta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 4,
    flexShrink: 0,
  },
  time: { fontSize: 10, color: "var(--dark-300)" },
  div: { height: "0.5px", background: "var(--dark-700)", margin: "0 16px" },
};
