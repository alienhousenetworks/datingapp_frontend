import React, { useState, useRef, useEffect } from "react";
import { chatAPI, wsURL, API_BASE_URL, authAPI } from "../api";
import { getUserDisplayName, getUserInitial } from "../utils/userDisplay";

const getAbsoluteMediaUrl = (url) => {
  if (!url) return null;
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${API_BASE_URL}${url.startsWith("/") ? "" : "/"}${url}`;
};


const COLORS = ["#FF1F6B", "#A855F7", "#06B6D4", "#F59E0B", "#10B981"];
const getColor = (i) => COLORS[i % COLORS.length];

export default function ChatWindow({ conversation, onDeleteConversation, onConversationInvalid }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const [loading, setLoading] = useState(false);
  
  // New features state
  const [activePickerMsgId, setActivePickerMsgId] = useState(null);
  const [hoveredMsgId, setHoveredMsgId] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportMsgId, setReportMsgId] = useState("");
  const [reportTargetType, setReportTargetType] = useState("CHAT_MESSAGE");
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDescription, setReportDescription] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const [leavingChat, setLeavingChat] = useState(false);

  const [activeMediaMessage, setActiveMediaMessage] = useState(null);
  const [mediaCountdown, setMediaCountdown] = useState(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);

  // Preview before send
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [mediaType, setMediaType] = useState("");


  // Countdown effect for active media message
  useEffect(() => {
    if (!activeMediaMessage) {
      setMediaCountdown(null);
      return;
    }
    // If it's an image, start the 10s countdown immediately
    if (activeMediaMessage.type === "view_once" || activeMediaMessage.type === "image") {
      setMediaCountdown(10);
    }
  }, [activeMediaMessage]);

  useEffect(() => {
    if (mediaCountdown === null) return;
    if (mediaCountdown <= 0) {
      if (activeMediaMessage) {
        handleMediaDestruct(activeMediaMessage);
      }
      return;
    }

    const timer = setTimeout(() => {
      setMediaCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [mediaCountdown, activeMediaMessage]);

  const handleMediaDestruct = async (msg) => {
    setActiveMediaMessage(null);
    setMediaCountdown(null);
    try {
      await chatAPI.markSeen(msg.id);
    } catch (err) {
      console.error("Failed to mark media message as seen", err);
    }
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id
          ? {
              ...m,
              is_seen: true,
              is_deleted: true,
              text: "[Media Deleted]",
            }
          : m
      )
    );
  };

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file || !conversation?.id) return;

    let type = "image";
    if (file.type.startsWith("video/")) {
      type = "video";
    } else if (!file.type.startsWith("image/")) {
      alert("Only images and videos are supported!");
      return;
    }

    setSelectedFile(file);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(URL.createObjectURL(file));
    setMediaType(type);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };


  const renderMessageContent = (m) => {
    const isOpened = m.is_deleted || m.is_seen || m.text === "[Media Deleted]" || m.text === "[Message Expired]";
    
    if (m.type === "view_once" || m.type === "image") {
      if (isOpened) {
        return (
          <div style={styles.mediaPlaceholderOpened}>
            <span>🔒 Opened Image</span>
          </div>
        );
      }
      if (m.from === "mine") {
        return (
          <div style={styles.mediaPlaceholderSent}>
            <span>📷 Sent View Once Image</span>
          </div>
        );
      }
      return (
        <button
          onClick={() => setActiveMediaMessage(m)}
          style={styles.mediaViewBtn}
        >
          <span>📷 Tap to View Image (10s)</span>
        </button>
      );
    }
    
    if (m.type === "view_once_video" || m.type === "video") {
      if (isOpened) {
        return (
          <div style={styles.mediaPlaceholderOpened}>
            <span>🔒 Opened Video</span>
          </div>
        );
      }
      if (m.from === "mine") {
        return (
          <div style={styles.mediaPlaceholderSent}>
            <span>🎥 Sent View Once Video</span>
          </div>
        );
      }
      return (
        <button
          onClick={() => setActiveMediaMessage(m)}
          style={styles.mediaViewBtn}
        >
          <span>🎥 Tap to Play Video</span>
        </button>
      );
    }
    
    return <span>{m.text}</span>;
  };

  const wsRef = useRef(null);
  const endRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  // Prevents multiple parallel connectWebSocket() invocations (e.g. mount + visibilitychange)
  const wsConnectingRef = useRef(false);

  // ── Load messages when conversation changes ─────────────
  useEffect(() => {
    if (!conversation?.id) return;
    setMessages([]);
    loadMessages();
    connectWebSocket();
    loadDraft();

    // Reconnect WS when tab becomes visible (user switches back)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const ws = wsRef.current;
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          connectWebSocket();
          loadMessages(); // catch any missed messages
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      // Cleanup WebSocket on conversation switch
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [conversation?.id]);

  useEffect(() => {
    setSelectedFile(null);
    setMediaType("");
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  }, [conversation?.id]);


  // ── Global new message fallback listener ────────────────
  useEffect(() => {
    if (!conversation?.id) return;

    const handleGlobalNewMessage = (e) => {
      const payload = e.detail;
      if (payload && String(payload.conversation_id) === String(conversation.id)) {
        const data = payload.message;
        if (data) {
          const other = conversation.other_user || {};
          const isMine = String(data.sender) !== String(other.id);
          
          if (!isMine && !data.is_seen) {
            try {
              chatAPI.markSeen(data.id);
            } catch (err) {
              console.error("Failed to mark incoming global message as seen", err);
            }
          }

          setMessages((prev) => {
            if (prev.some((m) => m.id === data.id)) return prev;
            if (isMine) {
              const optIndex = prev.findIndex((m) => typeof m.id === "number" && m.text === data.content?.text);
              if (optIndex !== -1) {
                const updated = [...prev];
                updated[optIndex] = {
                  id: data.id,
                  from: "mine",
                  text: data.content?.text || "",
                  url: getAbsoluteMediaUrl(data.content?.url),
                  type: data.message_type || "text",
                  is_seen: data.is_seen,
                  delivered_at: data.delivered_at,
                  is_deleted: data.is_deleted,
                  time: data.created_at,
                  reactions: data.reactions || [],
                };
                return updated;
              }
            }
            return [
              ...prev,
              {
                id: data.id,
                from: isMine ? "mine" : "them",
                text: data.content?.text || "",
                url: getAbsoluteMediaUrl(data.content?.url),
                type: data.message_type || "text",
                is_seen: data.is_seen || !isMine,
                delivered_at: data.delivered_at,
                is_deleted: data.is_deleted,
                time: data.created_at,
                reactions: data.reactions || [],
              },
            ];
          });
        }
      }
    };

    window.addEventListener("new_message", handleGlobalNewMessage);
    return () => {
      window.removeEventListener("new_message", handleGlobalNewMessage);
    };
  }, [conversation?.id]);


  // ── Polling fallback (15s) when WebSocket is not open ───
  useEffect(() => {
    if (!conversation?.id) return;
    const pollInterval = setInterval(() => {
      // Only poll if WebSocket is not open (saves bandwidth)
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        loadMessages();
      }
    }, 15000);
    return () => clearInterval(pollInterval);
  }, [conversation?.id]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typing]);

  const loadDraft = async () => {
    if (!conversation?.id) return;
    // Instant local draft (no network required)
    const local = chatAPI.getLocalDraft(conversation.id);
    if (local) setInput(local);
    try {
      const draft = await chatAPI.getDraft(conversation.id);
      if (draft && draft.content && !local) {
        setInput(draft.content);
      }
    } catch {
      /* local draft already applied */
    }
  };

  // Debounced draft save (local + best-effort server)
  useEffect(() => {
    if (!conversation?.id) return;
    const delayDebounceFn = setTimeout(() => {
      chatAPI.saveDraft(conversation.id, input).catch(() => {});
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [input, conversation?.id]);

  // ── Load message history from REST ─────────────────────
  const loadMessages = async () => {
    setLoading(true);
    try {
      const data = await chatAPI.getMessages(conversation.id);
      // API returns newest first — reverse for display
      const msgs = Array.isArray(data)
        ? data.reverse()
        : (data.results || []).reverse();

      // Mark unseen incoming messages as seen
      msgs.forEach(async (m) => {
        if (!m.is_me && !m.is_seen) {
          try {
            const messageId = m.id ? String(m.id) : null;
            if (!messageId || messageId.startsWith('temp')) return;
            await chatAPI.markSeen(messageId);
          } catch (e) {
            console.warn("[Chat Sync] Message ID not yet ready on backend server.");
          }
        }
      });

      setMessages(
        msgs.map((m) => ({
          id: m.id,
          from: m.is_me ? "mine" : "them",
          text: m.content?.text || "",
          url: getAbsoluteMediaUrl(m.content?.url),
          type: m.message_type || "text",
          is_seen: m.is_seen,
          delivered_at: m.delivered_at,
          is_deleted: m.is_deleted,
          time: m.created_at,
          reactions: m.reactions || [],
        })),
      );
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };


  // ── WebSocket for real-time messages ─────────────────
  const connectWebSocket = async () => {
    // Prevent parallel connect calls (e.g. mount + visibilitychange firing simultaneously).
    // Each call resets reconnectAttemptsRef to 0, making every attempt look like the "first",
    // so the permanent-auth-failure guard never fires until all parallel calls complete.
    if (wsConnectingRef.current) return;
    wsConnectingRef.current = true;

    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    reconnectAttemptsRef.current = 0;

    // Guard: verify the user is still a participant before opening the socket.
    // This prevents a 403 storm when the conversation was deleted/unmatched but
    // the UI still holds a stale activeConv reference.
    try {
      const convs = await chatAPI.getConversations();
      const isParticipant = (convs || []).some((c) => c.id === conversation.id);
      if (!isParticipant) {
        console.warn(
          `[ChatWS] Conversation ${conversation.id} not found in user's list — aborting WS connect.`
        );
        wsConnectingRef.current = false;
        // Notify parent so it can clear the stale activeConv and re-select a valid one
        if (typeof onConversationInvalid === 'function') {
          onConversationInvalid(conversation.id);
        }
        return;
      }
    } catch (err) {
      console.warn("[ChatWS] Could not verify conversation participation:", err);
      // Proceed optimistically; the server will reject if truly unauthorised.
    }

    wsConnectingRef.current = false;

    const connect = async (isReconnect = false) => {
      // Abort if the conversation reference has changed (e.g. user switched chat)
      if (!wsRef || wsRef._aborted) return;

      try {
        const res = await authAPI.getWsTicket();
        if (!res || !res.ticket) return;
        const ws = new WebSocket(
          wsURL.chat(conversation.id, res.ticket),
        );

        ws.onopen = () => {
          // Reset backoff on successful connection
          reconnectAttemptsRef.current = 0;
          // On reconnect, reload messages from REST to catch any that came in while disconnected
          if (isReconnect) {
            loadMessages();
          }
        };

        ws.onmessage = (e) => {
          const data = JSON.parse(e.data);
          if (data.type === "message") {
            const isMine = data.is_me;
            
            // Mark incoming message as seen immediately if we are viewing the chat
            if (!isMine && !data.is_seen) {
              try {
                chatAPI.markSeen(data.id);
              } catch (err) {
                console.error("Failed to mark incoming message as seen", err);
              }
            }

            setMessages((prev) => {
              if (prev.some((m) => m.id === data.id)) return prev;
              if (isMine) {
                const optIndex = prev.findIndex((m) => typeof m.id === "number" && m.text === data.content?.text);
                if (optIndex !== -1) {
                  const updated = [...prev];
                  updated[optIndex] = {
                    id: data.id,
                    from: "mine",
                    text: data.content?.text || "",
                    url: getAbsoluteMediaUrl(data.content?.url),
                    type: data.message_type || "text",
                    is_seen: data.is_seen || !isMine,
                    delivered_at: data.delivered_at,
                    is_deleted: data.is_deleted,
                    time: data.created_at,
                    reactions: data.reactions || [],
                  };
                  return updated;
                }
              }
              return [
                ...prev,
                {
                  id: data.id,
                  from: isMine ? "mine" : "them",
                  text: data.content?.text || "",
                  url: getAbsoluteMediaUrl(data.content?.url),
                  type: data.message_type || "text",
                  is_seen: data.is_seen || !isMine,
                  delivered_at: data.delivered_at,
                  is_deleted: data.is_deleted,
                  time: data.created_at,
                  reactions: data.reactions || [],
                },
              ];
            });
            // Dispatch global custom event so sidebar conversation previews update in real time
            window.dispatchEvent(
              new CustomEvent("new_message", {
                detail: { conversation_id: conversation.id, message: data },
              })
            );
          } else if (data.type === "message_update") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === data.message_id
                  ? {
                      ...m,
                      is_seen: data.is_seen !== undefined ? data.is_seen : m.is_seen,
                      delivered_at: data.delivered_at !== undefined ? data.delivered_at : m.delivered_at,
                      is_deleted: data.is_deleted !== undefined ? data.is_deleted : m.is_deleted,
                      text: data.content?.text !== undefined ? data.content.text : m.text,
                    }
                  : m
              )
            );
          }
          if (data.type === "typing") {
            setTyping(data.status === "start" && !data.is_me);
            if (data.status === "start") {
              setTimeout(() => setTyping(false), 3000);
            }
          }
        };

        ws.onclose = (event) => {
          // WebSocket close codes for permanent auth failures:
          //   1006 = abnormal closure (what browsers report for HTTP 403 on WS upgrade)
          //   4403 = custom code the server can send for explicit unauthorised close
          // Do NOT retry these — the conversation is gone or the user is not a participant.
          const isPermanentAuthFailure =
            event.code === 4403 ||
            (event.code === 1006 && reconnectAttemptsRef.current === 0);

          if (isPermanentAuthFailure) {
            console.warn(
              `[ChatWS] Permanent auth failure (code ${event.code}) for conversation ${conversation.id}. Stopping retries.`
            );
            return;
          }

          // Exponential backoff: 5s, 10s, 20s, 30s max
          const attempts = reconnectAttemptsRef.current;
          const delay = Math.min(5000 * Math.pow(2, attempts), 30000);
          reconnectAttemptsRef.current = attempts + 1;
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(true); // isReconnect=true so it reloads messages
          }, delay);
        };

        ws.onerror = () => {
          ws.close();
        };

        wsRef.current = ws;
      } catch (err) {
        console.error("Chat WS connection failed", err);
      }
    };

    connect();
  };

  // ── Send message ────────────────────────────────────────
  const send = async () => {
    if (selectedFile) {
      const file = selectedFile;
      const type = mediaType === "video" ? "view_once_video" : "view_once";
      
      setSelectedFile(null);
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
        setPreviewUrl(null);
      }
      setMediaType("");
      
      setUploadingMedia(true);
      try {
        await chatAPI.uploadMedia(conversation.id, file, type);
      } catch (err) {
        console.error("Failed to upload media", err);
        alert("Failed to send media. Please try again.");
      } finally {
        setUploadingMedia(false);
      }
      return;
    }

    const text = input.trim();
    if (!text || !conversation?.id) return;

    // Optimistic UI — add message immediately
    const tempMsg = {
      id: Date.now(),
      from: "mine",
      text,
      time: new Date().toISOString(),
      reactions: [],
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");

    // Clear backend draft
    try {
      chatAPI.saveDraft(conversation.id, "");
    } catch {}

    // Try WebSocket first, fall back to REST
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "message",
          content: text,
          message_type: "text",
        }),
      );
    } else {
      try {
        await chatAPI.sendMessage(conversation.id, text);
      } catch {}
    }
  };


  const toggleEmojiPicker = (id) => {
    setActivePickerMsgId((prev) => (prev === id ? null : id));
  };

  const handleEmojiSelect = async (msgId, emoji) => {
    setActivePickerMsgId(null);
    try {
      await chatAPI.reactMessage(msgId, emoji);
      loadMessages();
    } catch {}
  };

  const openReportModal = (msgId) => {
    setReportMsgId(msgId);
    setReportTargetType("CHAT_MESSAGE");
    setReportReason("SPAM");
    setReportDescription("");
    setShowReportModal(true);
  };

  const openReportProfileModal = () => {
    setReportTargetType("USER_PROFILE");
    setReportReason("SPAM");
    setReportDescription("");
    setShowReportModal(true);
  };

  const handleSubmitReport = async () => {
    if (reportReason === "OTHER" && !reportDescription.trim()) {
      alert("Please provide details for the report");
      return;
    }
    setSubmittingReport(true);
    try {
      if (reportTargetType === "USER_PROFILE") {
        const { moderationAPI } = require("../api");
        await moderationAPI.submitReport({
          reportedUserId: conversation?.other_user?.id,
          reason: reportReason,
          description: reportDescription.trim(),
          targetType: "USER_PROFILE"
        });
        alert("Profile reported successfully.");
      } else {
        await chatAPI.reportMessage(reportMsgId, reportReason, reportDescription.trim());
        alert("Message reported successfully.");
      }
      setShowReportModal(false);
    } catch {
      alert("Failed to submit report");
    } finally {
      setSubmittingReport(false);
    }
  };



  const handleLeaveChat = async () => {
    if (!window.confirm("Are you sure you want to leave this chat? It will be hidden and you will be unmatched.")) return;
    setLeavingChat(true);
    try {
      await chatAPI.leaveConversation(conversation.id);
      if (onDeleteConversation) {
        onDeleteConversation();
      }
    } catch (err) {
      console.error("Failed to leave chat", err);
      alert("Failed to leave chat. Please try again.");
    } finally {
      setLeavingChat(false);
    }
  };

  // ── Send typing indicator ───────────────────────────────
  const handleTyping = (e) => {
    setInput(e.target.value);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing", status: "start" }));
    }
  };

  if (!conversation) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>✉</div>
        <p style={styles.emptyText}>Select a conversation</p>
      </div>
    );
  }

  const other = conversation.other_user || {};
  const initial = getUserInitial(other);
  const name = getUserDisplayName(other);
  const color = getColor(0);

  return (
    <div style={styles.window}>
      {/* Header */}
      <div style={{ ...styles.header, justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ ...styles.av, background: color + "33", color }}>
            {initial}
          </div>
          <div style={styles.headerInfo}>
            <div style={styles.headerName}>{name}</div>
            <div style={styles.headerStatus}>
              {other.is_online ? (
                <>
                  <div style={styles.onlineDot} />
                  active now
                </>
              ) : (
                <>
                  <div style={{ ...styles.onlineDot, background: "var(--dark-400)" }} />
                  <span style={{ color: "var(--dark-400)" }}>offline</span>
                </>
              )}
            </div>
          </div>

        </div>
        
        {/* Calling trigger buttons */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            style={styles.callTriggerBtn}
            onClick={() => window.startCall && window.startCall(other.id, "voice")}
            title="Start voice call"
          >
            📞 Call
          </button>
          <button
            style={styles.callTriggerBtn}
            onClick={() => window.startCall && window.startCall(other.id, "video")}
            title="Start video call"
          >
            📹 Video
          </button>
          <button
            style={{ ...styles.callTriggerBtn, borderColor: "var(--pink)", color: "var(--pink-soft)" }}
            onClick={() => window.startCall && window.startCall(other.id, "blind_date")}
            title="Start blind date call"
          >
            🎭 Blind Date
          </button>
          <button
            style={{ ...styles.callTriggerBtn, borderColor: "#A855F7", color: "#D8B4FE" }}
            onClick={handleLeaveChat}
            disabled={leavingChat}
            title="Leave Chat"
          >
            🚪 {leavingChat ? "Leaving..." : "Leave"}
          </button>
          <button
            style={{ ...styles.callTriggerBtn, borderColor: "#F59E0B", color: "#FCD34D" }}
            onClick={openReportProfileModal}
            title="Report Profile"
          >
            ⚑ Report
          </button>
        </div>
      </div>

      {/* Hot take card */}
      <div style={styles.hotTake}>
        <div style={styles.htLabel}>Hot take of the day</div>
        <div style={styles.htQ}>
          "The talking stage is just emotional labour with a situationship
          contract."
        </div>
        <div style={styles.htBtns}>
          <button style={styles.htBtn}>true 💀</button>
          <button style={styles.htBtn}>cope</button>
        </div>
      </div>

      {/* Messages */}
      <div style={styles.messages}>
        {loading ? (
          <p
            style={{
              textAlign: "center",
              color: "var(--dark-400)",
              fontSize: 12,
              marginTop: 20,
            }}
          >
            Loading messages…
          </p>
        ) : messages.length === 0 ? (
          <p
            style={{
              textAlign: "center",
              color: "var(--dark-400)",
              fontSize: 12,
              marginTop: 20,
            }}
          >
            No messages yet — say hello! 👋
          </p>
        ) : (
          messages.map((m, i) => {
            const hasReactions = m.reactions && m.reactions.length > 0;
            const isHovered = hoveredMsgId === m.id;
            return (
              <div
                key={m.id || i}
                style={{
                  ...styles.msgRow,
                  ...(m.from === "mine" ? styles.msgRowMine : {}),
                  position: "relative",
                }}
                onMouseEnter={() => setHoveredMsgId(m.id)}
                onMouseLeave={() => setHoveredMsgId(null)}
              >
                {m.from === "them" && (
                  <div
                    style={{ ...styles.msgAv, background: color + "33", color }}
                  >
                    {initial}
                  </div>
                )}
                
                <div style={{ display: "flex", flexDirection: "column", maxWidth: "70%", alignItems: m.from === "mine" ? "flex-end" : "flex-start", position: "relative" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexDirection: m.from === "mine" ? "row-reverse" : "row" }}>
                    <div
                      style={{
                        ...styles.bubble,
                        ...(m.from === "mine"
                          ? styles.bubbleMine
                          : styles.bubbleThem),
                        marginBottom: hasReactions ? 4 : 0,
                        ...(m.type && m.type !== "text" && m.from === "them" && !(m.is_deleted || m.is_seen || m.text === "[Media Deleted]" || m.text === "[Message Expired]") ? { padding: 0, background: "transparent", border: "none" } : {}),
                        ...((m.is_deleted || m.is_seen || m.text === "[Media Deleted]" || m.text === "[Message Expired]") && m.type && m.type !== "text" ? { background: "var(--dark-700)", border: "0.5px solid var(--dark-600)" } : {})
                      }}
                    >
                      {renderMessageContent(m)}
                    </div>

                    {/* Toolbar showing react & report */}
                    <div style={{ ...styles.msgToolbar, opacity: isHovered ? 1 : 0, pointerEvents: isHovered ? "auto" : "none" }}>
                      <button
                        style={styles.toolbarBtn}
                        onClick={() => toggleEmojiPicker(m.id)}
                        title="React"
                      >
                        ☺
                      </button>
                      <button
                        style={styles.toolbarBtn}
                        onClick={() => openReportModal(m.id)}
                        title="Report message"
                      >
                        ⚑
                      </button>
                    </div>
                  </div>

                  {/* Sent time & status ticks */}
                  {m.time && (
                    <div style={{
                      fontSize: 10,
                      color: "var(--dark-400)",
                      marginTop: 2,
                      marginBottom: hasReactions ? 2 : 4,
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      alignSelf: m.from === "mine" ? "flex-end" : "flex-start"
                    }}>
                      {new Date(m.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      {m.from === "mine" && (
                        <span style={{ display: "flex", alignItems: "center" }}>
                          {m.is_seen ? (
                            <span style={{ color: "var(--teal)", fontWeight: "bold", fontSize: 13, lineHeight: 1 }}>✓✓</span>
                          ) : m.delivered_at ? (
                            <span style={{ color: "var(--dark-400)", fontSize: 13, lineHeight: 1 }}>✓✓</span>
                          ) : (
                            <span style={{ color: "var(--dark-400)", fontSize: 13, lineHeight: 1 }}>✓</span>
                          )}
                        </span>
                      )}
                    </div>
                  )}


                  {/* Active Reactions */}
                  {hasReactions && (
                    <div style={{ ...styles.reactionsContainer, alignSelf: m.from === "mine" ? "flex-end" : "flex-start" }}>
                      {m.reactions.map((r, ri) => (
                        <span
                          key={r.id || ri}
                          style={styles.reactionBadge}
                          title={`Reacted by ${getUserDisplayName(r.user)}`}
                          onClick={() => handleEmojiSelect(m.id, r.emoji)}
                        >
                          {r.emoji}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Emoji Picker Popover */}
                  {activePickerMsgId === m.id && (
                    <div style={{ ...styles.emojiPicker, right: m.from === "mine" ? 0 : "auto", left: m.from === "them" ? 0 : "auto" }}>
                      {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((emoji) => (
                        <span
                          key={emoji}
                          style={styles.emojiItem}
                          onClick={() => handleEmojiSelect(m.id, emoji)}
                        >
                          {emoji}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {typing && (
          <div style={styles.msgRow}>
            <div style={{ ...styles.msgAv, background: color + "33", color }}>
              {initial}
            </div>
            <div
              style={{
                ...styles.bubble,
                ...styles.bubbleThem,
                color: "var(--dark-300)",
              }}
            >
              typing...
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Preview selection */}
      {previewUrl && (
        <div style={styles.mediaPreviewBar}>
          <div style={styles.mediaPreviewWrapper}>
            {mediaType === "video" ? (
              <video src={previewUrl} style={styles.mediaPreview} controls={false} />
            ) : (
              <img src={previewUrl} alt="Preview" style={styles.mediaPreview} />
            )}
            <button 
              onClick={() => {
                setSelectedFile(null);
                if (previewUrl) {
                  URL.revokeObjectURL(previewUrl);
                  setPreviewUrl(null);
                }
                setMediaType("");
              }}
              style={styles.mediaPreviewClose}
            >
              ✕
            </button>
          </div>
          <span style={styles.mediaPreviewType}>
            {mediaType === "video" ? "📹 Ready to send video" : "📷 Ready to send image"}
          </span>
        </div>
      )}

      {/* Input */}
      {conversation.has_other_user_left ? (
        <div style={{ padding: 16, textAlign: "center", color: "var(--dark-400)", fontSize: 13, borderTop: "1px solid var(--dark-800)" }}>
          This user has left the chat. You can no longer reply.
        </div>
      ) : (
        <div style={styles.inputRow}>
          <button
            type="button"
            style={styles.attachBtn}
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingMedia}
            title="Send self-destructing media"
          >
            {uploadingMedia ? "..." : "📎"}
          </button>
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            accept="image/*,video/*"
            onChange={handleFileChange}
          />
          <input
            style={styles.input}
            placeholder={
              uploadingMedia 
                ? "Uploading self-destructing media..." 
                : previewUrl 
                  ? "Click Send to upload selected media..." 
                  : "say something..."
            }
            value={previewUrl ? "" : input}
            onChange={handleTyping}
            onKeyDown={(e) => e.key === "Enter" && send()}
            disabled={uploadingMedia || !!previewUrl}
          />
          <button style={styles.sendBtn} onClick={send} disabled={uploadingMedia}>
            ↑
          </button>
        </div>
      )}


      {/* Media Viewer Overlay */}
      {activeMediaMessage && (
        <div style={styles.mediaOverlay}>
          <div style={styles.mediaOverlayHeader}>
            <div style={styles.mediaOverlayTitle}>
              🔒 Private Media from {getUserDisplayName(other)}
            </div>
            {mediaCountdown !== null && (
              <div style={styles.mediaTimer}>
                ⏳ Self-destructing in {mediaCountdown}s
              </div>
            )}
            <button
              onClick={() => handleMediaDestruct(activeMediaMessage)}
              style={styles.mediaOverlayClose}
              title="Close and destruct"
            >
              ✕
            </button>
          </div>

          <div style={styles.mediaContainer}>
            {/* Security watermarks */}
            <div style={styles.watermarkDiagonal}>
              <div style={styles.watermarkText}>
                {getUserDisplayName(other)}
              </div>
            </div>

            {(activeMediaMessage.type === "view_once" || activeMediaMessage.type === "image") ? (
              <img
                src={activeMediaMessage.url}
                alt="View Once Content"
                style={styles.overlayImage}
                onDragStart={(e) => e.preventDefault()}
                onContextMenu={(e) => e.preventDefault()}
              />
            ) : (
              <video
                ref={videoRef}
                src={activeMediaMessage.url}
                controls
                autoPlay
                onPlay={() => {
                  if (mediaCountdown !== null && videoRef.current && videoRef.current.currentTime < videoRef.current.duration) {
                    setMediaCountdown(null);
                  }
                }}
                onEnded={() => {
                  if (mediaCountdown === null) {
                    setMediaCountdown(10);
                  }
                }}
                style={styles.overlayVideo}
                onContextMenu={(e) => e.preventDefault()}
              />
            )}
          </div>
        </div>
      )}

      {showReportModal && (
        <>
          <div style={styles.modalBackdrop} onClick={() => setShowReportModal(false)} />
          <div style={styles.customModal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>{reportTargetType === "USER_PROFILE" ? "Report Profile ⚑" : "Report Message ⚑"}</h3>
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
              {submittingReport ? "Reporting..." : "Submit Report"}
            </button>
          </div>
        </>
      )}

    </div>
  );
}

const styles = {
  window: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    background: "var(--dark-900)",
    minWidth: 0,
  },
  empty: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    background: "var(--dark-900)",
  },
  emptyIcon: { fontSize: 36, color: "var(--dark-500)" },
  emptyText: {
    fontSize: 14,
    color: "var(--dark-300)",
    fontFamily: "var(--font-display)",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "14px 20px",
    background: "var(--dark-800)",
    borderBottom: "0.5px solid var(--dark-600)",
    flexShrink: 0,
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
    fontSize: 17,
    flexShrink: 0,
  },
  headerInfo: {},
  headerName: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    fontWeight: 700,
    color: "var(--white)",
  },
  headerStatus: {
    display: "flex",
    alignItems: "center",
    gap: 5,
    fontSize: 11,
    color: "var(--teal)",
    marginTop: 2,
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--teal)",
  },
  hotTake: {
    background: "var(--dark-700)",
    border: "0.5px solid rgba(255,31,107,0.3)",
    borderRadius: 14,
    margin: "14px 18px",
    padding: "12px 14px",
    flexShrink: 0,
  },
  htLabel: {
    fontSize: 9,
    fontWeight: 700,
    color: "var(--pink)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontFamily: "var(--font-display)",
    marginBottom: 5,
  },
  htQ: { fontSize: 13, color: "var(--white)", lineHeight: 1.55 },
  htBtns: { display: "flex", gap: 8, marginTop: 10 },
  htBtn: {
    fontSize: 11,
    padding: "5px 13px",
    borderRadius: 20,
    background: "var(--pink-dim)",
    color: "var(--pink-soft)",
    border: "0.5px solid rgba(255,31,107,0.3)",
    cursor: "pointer",
    fontWeight: 500,
  },
  messages: {
    flex: 1,
    overflowY: "auto",
    padding: "4px 18px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  msgRow: { display: "flex", gap: 8, alignItems: "flex-end" },
  msgRowMine: { flexDirection: "row-reverse" },
  msgAv: {
    width: 28,
    height: 28,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 11,
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    flexShrink: 0,
  },
  bubble: {
    padding: "10px 14px",
    borderRadius: 18,
    fontSize: 13,
    lineHeight: 1.55,
    maxWidth: "70%",
  },
  bubbleThem: {
    background: "var(--dark-600)",
    color: "var(--white)",
    borderBottomLeftRadius: 4,
    border: "0.5px solid var(--dark-400)",
  },
  bubbleMine: {
    background: "var(--pink)",
    color: "#fff",
    borderBottomRightRadius: 4,
  },
  inputRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 18px 14px",
    background: "var(--dark-800)",
    borderTop: "0.5px solid var(--dark-600)",
    flexShrink: 0,
  },
  input: {
    flex: 1,
    height: 40,
    borderRadius: 24,
    border: "0.5px solid var(--dark-400)",
    background: "var(--dark-600)",
    fontSize: 13,
    padding: "0 16px",
    color: "var(--white)",
    outline: "none",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 12px rgba(255,31,107,0.3)",
  },
  callTriggerBtn: {
    padding: "6px 12px",
    borderRadius: 16,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--white)",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 4,
    transition: "background 0.15s",
  },
  msgToolbar: {
    display: "flex",
    gap: 4,
    transition: "opacity 0.15s",
  },
  toolbarBtn: {
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    borderRadius: "50%",
    width: 24,
    height: 24,
    fontSize: 12,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.15s, background 0.15s",
    outline: "none",
  },
  reactionsContainer: {
    display: "flex",
    gap: 4,
    marginTop: 2,
    marginBottom: 4,
  },
  reactionBadge: {
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    padding: "2px 6px",
    borderRadius: 10,
    fontSize: 11,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 2,
    transition: "background 0.15s",
  },
  emojiPicker: {
    position: "absolute",
    bottom: "100%",
    zIndex: 100,
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-500)",
    borderRadius: 20,
    padding: "6px 10px",
    display: "flex",
    gap: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
    marginBottom: 6,
  },
  emojiItem: {
    fontSize: 16,
    cursor: "pointer",
    transition: "transform 0.1s",
  },
  mediaPreviewBar: {
    padding: "12px 18px",
    background: "var(--dark-800)",
    borderTop: "0.5px solid var(--dark-600)",
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexShrink: 0,
  },
  mediaPreviewWrapper: {
    position: "relative",
    width: 60,
    height: 60,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid var(--pink)",
  },
  mediaPreview: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
  },
  mediaPreviewClose: {
    position: "absolute",
    top: 2,
    right: 2,
    width: 16,
    height: 16,
    borderRadius: "50%",
    background: "rgba(0,0,0,0.6)",
    color: "#fff",
    border: "none",
    fontSize: 9,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  mediaPreviewType: {
    fontSize: 12,
    color: "var(--dark-200)",
    fontWeight: 500,
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
    fontSize: 16,
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
  attachBtn: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--white)",
    fontSize: 16,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background 0.15s",
  },
  mediaPlaceholderOpened: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "var(--dark-300)",
    fontSize: 13,
    fontStyle: "italic",
    padding: "4px 8px",
  },
  mediaPlaceholderSent: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "rgba(255,255,255,0.6)",
    fontSize: 13,
    padding: "4px 8px",
  },
  mediaViewBtn: {
    background: "rgba(255, 31, 107, 0.12)",
    border: "1px solid rgba(255, 31, 107, 0.4)",
    borderRadius: 12,
    color: "var(--pink-soft)",
    padding: "10px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    transition: "background 0.2s, border-color 0.2s",
    outline: "none",
  },
  mediaOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 5, 5, 0.95)",
    backdropFilter: "blur(12px)",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    animation: "fadeIn 0.3s ease both",
  },
  mediaOverlayHeader: {
    position: "absolute",
    top: 24,
    left: 24,
    right: 24,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    zIndex: 1002,
  },
  mediaOverlayTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 16,
    fontWeight: 700,
    color: "var(--white)",
    background: "rgba(0,0,0,0.6)",
    padding: "8px 16px",
    borderRadius: 20,
    border: "0.5px solid var(--dark-500)",
    backdropFilter: "blur(4px)",
  },
  mediaTimer: {
    fontFamily: "var(--font-display)",
    fontSize: 15,
    fontWeight: 800,
    color: "var(--white)",
    background: "var(--pink)",
    padding: "8px 16px",
    borderRadius: 20,
    boxShadow: "0 2px 10px rgba(255,31,107,0.4)",
  },
  mediaOverlayClose: {
    background: "rgba(255,255,255,0.1)",
    border: "none",
    color: "var(--white)",
    fontSize: 18,
    width: 36,
    height: 36,
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    transition: "background 0.2s",
  },
  mediaContainer: {
    position: "relative",
    width: "90%",
    maxWidth: 800,
    maxHeight: "75vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 10px 30px rgba(0,0,0,0.8)",
  },
  overlayImage: {
    maxWidth: "100%",
    maxHeight: "75vh",
    objectFit: "contain",
  },
  overlayVideo: {
    width: "100%",
    maxHeight: "75vh",
    background: "#000",
  },
  watermarkDiagonal: {
    position: "absolute",
    inset: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
    userSelect: "none",
    zIndex: 1001,
  },
  watermarkText: {
    transform: "rotate(-30deg)",
    fontSize: "clamp(2rem, 8vw, 4rem)",
    fontWeight: 800,
    fontFamily: "var(--font-display)",
    color: "rgba(255, 255, 255, 0.06)",
    whiteSpace: "nowrap",
    textTransform: "uppercase",
    letterSpacing: "0.2em",
  },
};
