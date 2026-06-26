import React, { useState, useEffect, useRef } from "react";
import { wsURL, authAPI } from "../api";
import stylesModule from "../styles/BlindDatePage.module.css";

export default function BlindDatePage({ user }) {
  const [status, setStatus] = useState("idle"); // idle, connecting, searching, matched
  const [elapsed, setElapsed] = useState(0);
  const socketRef = useRef(null);
  const timerRef = useRef(null);

  // Timer to count elapsed search time
  useEffect(() => {
    if (status === "searching") {
      setElapsed(0);
      timerRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1);
      }, 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [status]);

  // Clean up WebSocket connection when leaving the page
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, []);

  const startSearch = async () => {
    try {
      // Request camera and microphone access to cache permissions before entering the queue
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      // Stop tracks immediately to turn camera off while searching
      stream.getTracks().forEach((track) => track.stop());
    } catch (err) {
      alert("⚠️ Camera and microphone access is required to enter the Blind Date queue. Please grant permissions and try again.");
      console.error("User denied media access on entering queue", err);
      return;
    }

    setStatus("connecting");
    const res = await authAPI.getWsTicket();
    if (!res || !res.ticket) return;
    const ws = new WebSocket(wsURL.blindDate(res.ticket));

    ws.onopen = () => {
      setStatus("searching");
      ws.send(JSON.stringify({ action: "join" }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "joined_queue") {
          setStatus("searching");
        } else if (data.type === "match_found") {
          setStatus("matched");
          // Trigger the global call manager to start the WebRTC blind date call
          if (window.startBlindDateCall) {
            window.startBlindDateCall(data.session_id, data.other_user_id);
          }
          ws.close();
        }
      } catch (err) {
        console.error("Failed to parse WebSocket message:", err);
      }
    };

    ws.onclose = () => {
      setStatus((prev) => (prev === "matched" ? "matched" : "idle"));
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      setStatus("idle");
    };

    socketRef.current = ws;
  };

  const stopSearch = () => {
    if (socketRef.current) {
      socketRef.current.send(JSON.stringify({ action: "leave" }));
      socketRef.current.close();
    }
    setStatus("idle");
  };

  const formatTime = (secs) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins}:${remaining < 10 ? "0" : ""}${remaining}`;
  };

  return (
    <div style={styles.page} className={stylesModule.page}>
      {/* Background glow effects */}
      <div style={styles.glow1} />
      <div style={styles.glow2} />

      <div style={styles.content} className={stylesModule.content}>
        <div style={styles.header}>
          <h1 style={styles.title} className={stylesModule.title}>🎭 Blind Date Matchmaker</h1>
          <p style={styles.subTitle} className={stylesModule.subTitle}>
            Connect anonymously based on matching vibes, intent, and location.
          </p>
        </div>

        {/* Center UI Display */}
        <div style={styles.radarContainer} className={stylesModule.radarContainer}>
          {status === "idle" && (
            <div style={styles.radarPlaceholder} className={stylesModule.radarPlaceholder}>
              <span style={styles.radarIcon} className={stylesModule.radarIcon}>🎭</span>
            </div>
          )}

          {status === "connecting" && (
            <div style={styles.radarScanning} className={stylesModule.radarScanning}>
              <div style={styles.radarWave1} className={stylesModule.radarWave1} />
              <div style={styles.radarCenter} className={stylesModule.radarCenter}>
                <span style={styles.radarIcon} className={stylesModule.radarIcon}>💫</span>
              </div>
            </div>
          )}

          {status === "searching" && (
            <div style={styles.radarScanning} className={stylesModule.radarScanning}>
              <div style={styles.radarWave1} className={stylesModule.radarWave1} />
              <div style={styles.radarWave2} className={stylesModule.radarWave2} />
              <div style={styles.radarWave3} className={stylesModule.radarWave3} />
              <div style={styles.radarCenter} className={stylesModule.radarCenter}>
                <span style={styles.radarIconAnim} className={stylesModule.radarIconAnim}>🎭</span>
              </div>
            </div>
          )}

          {status === "matched" && (
            <div style={styles.radarMatched}>
              <div style={styles.radarCenterMatched} className={stylesModule.radarCenterMatched}>
                <span style={styles.radarIcon} className={stylesModule.radarIcon}>💖</span>
              </div>
            </div>
          )}
        </div>

        {/* Info & Status controls */}
        <div style={styles.actionCard} className={stylesModule.actionCard}>
          {status === "idle" && (
            <>
              <p style={styles.statusText}>Ready to find your mystery match?</p>
              <button style={styles.startBtn} onClick={startSearch}>
                Enter Queue
              </button>
            </>
          )}

          {status === "connecting" && (
            <>
              <p style={styles.statusText}>Connecting to matchmaker...</p>
              <button style={styles.stopBtn} onClick={stopSearch}>
                Cancel
              </button>
            </>
          )}

          {status === "searching" && (
            <>
              <p style={styles.statusTextSearching}>
                Searching for a match...
              </p>
              <p style={styles.timerText}>Time elapsed: {formatTime(elapsed)}</p>
              <button style={styles.stopBtn} onClick={stopSearch}>
                Leave Queue
              </button>
            </>
          )}

          {status === "matched" && (
            <>
              <p style={styles.statusTextMatched}>Match Found! Connecting call...</p>
              <button style={styles.startBtn} disabled>
                Launching Call...
              </button>
            </>
          )}
        </div>

        {/* Rules & Guidelines */}
        <div style={styles.guidelinesCard} className={stylesModule.guidelinesCard}>
          <h3 style={styles.rulesTitle} className={stylesModule.rulesTitle}>How Blind Date works:</h3>
          <ul style={styles.rulesList}>
            <li style={styles.ruleItem} className={stylesModule.ruleItem}>
              🔒 <strong>Anonymity first:</strong> You start as voice & blurred video.
            </li>
            <li style={styles.ruleItem}>
              📸 <strong>5-minute unlock:</strong> After 5 minutes, cameras will automatically unblur.
            </li>
            <li style={styles.ruleItem}>
              💖 <strong>Save Chat:</strong> Vote to save contact at any time. If both vote, you match!
            </li>
            <li style={styles.ruleItem}>
              ⏰ <strong>15-minute limit:</strong> Sessions automatically end at 15 minutes.
            </li>
          </ul>
        </div>
      </div>

      <style>{`
        @keyframes pulse-radar {
          0% { transform: scale(1); opacity: 0.8; }
          100% { transform: scale(2.4); opacity: 0; }
        }
        @keyframes float-icon {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-8px); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    minHeight: "100vh",
    background: "var(--dark-950)",
    color: "var(--white)",
    padding: "40px 20px",
  },
  glow1: {
    position: "absolute",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,107,53,0.1) 0%, transparent 70%)",
    top: "-10%",
    left: "-10%",
    pointerEvents: "none",
  },
  glow2: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(168,85,247,0.08) 0%, transparent 70%)",
    bottom: "-10%",
    right: "-10%",
    pointerEvents: "none",
  },
  content: {
    width: "100%",
    maxWidth: 480,
    zIndex: 2,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 32,
  },
  header: {
    textAlign: "center",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 800,
    letterSpacing: "-0.02em",
    color: "var(--white)",
    marginBottom: 8,
  },
  subTitle: {
    fontSize: 14,
    color: "var(--dark-200)",
    lineHeight: 1.5,
  },
  radarContainer: {
    width: 200,
    height: 200,
    position: "relative",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radarPlaceholder: {
    width: 120,
    height: 120,
    borderRadius: "50%",
    background: "var(--dark-800)",
    border: "2px dashed var(--dark-500)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radarScanning: {
    position: "relative",
    width: 120,
    height: 120,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  radarCenter: {
    width: 100,
    height: 100,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #FF6B35 0%, #A855F7 100%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    boxShadow: "0 0 30px rgba(168,85,247,0.4)",
  },
  radarCenterMatched: {
    width: 110,
    height: 110,
    borderRadius: "50%",
    background: "var(--pink)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 5,
    boxShadow: "0 0 40px rgba(255,31,107,0.5)",
    animation: "float-icon 2s infinite ease-in-out",
  },
  radarWave1: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "1.5px solid #FF6B35",
    animation: "pulse-radar 2.4s infinite linear",
    pointerEvents: "none",
  },
  radarWave2: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "1.5px solid #A855F7",
    animation: "pulse-radar 2.4s infinite linear",
    animationDelay: "0.8s",
    pointerEvents: "none",
  },
  radarWave3: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: "50%",
    border: "1.5px solid var(--pink)",
    animation: "pulse-radar 2.4s infinite linear",
    animationDelay: "1.6s",
    pointerEvents: "none",
  },
  radarIcon: {
    fontSize: 42,
  },
  radarIconAnim: {
    fontSize: 42,
    animation: "float-icon 2.5s infinite ease-in-out",
  },
  radarMatched: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionCard: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 20,
    padding: "24px 32px",
    width: "100%",
    textAlign: "center",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
  },
  statusText: {
    fontSize: 15,
    fontWeight: 500,
    color: "var(--white)",
  },
  statusTextSearching: {
    fontSize: 15,
    fontWeight: 600,
    color: "#FF6B35",
  },
  statusTextMatched: {
    fontSize: 16,
    fontWeight: 700,
    color: "var(--teal)",
  },
  timerText: {
    fontSize: 13,
    color: "var(--dark-200)",
    fontFamily: "var(--font-mono, monospace)",
  },
  startBtn: {
    height: 48,
    borderRadius: 24,
    background: "linear-gradient(135deg, #FF6B35 0%, #A855F7 100%)",
    border: "none",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    fontFamily: "var(--font-display)",
    cursor: "pointer",
    transition: "transform 0.2s",
    boxShadow: "0 4px 20px rgba(168,85,247,0.3)",
  },
  stopBtn: {
    height: 48,
    borderRadius: 24,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-100)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  guidelinesCard: {
    width: "100%",
    background: "rgba(20,20,20,0.5)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "20px 24px",
    backdropFilter: "blur(4px)",
  },
  rulesTitle: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 12,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },
  rulesList: {
    paddingLeft: 0,
    listStyleType: "none",
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  ruleItem: {
    fontSize: 12,
    color: "var(--dark-200)",
    lineHeight: 1.5,
  },
};
