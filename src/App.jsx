import { useState } from "react";
import "./styles/globals.css";

// Pages
import SplashPage from "./pages/SplashPage";
import AuthPage from "./pages/AuthPage";
import OnboardingPage from "./pages/OnboardingPage";
import DiscoverPage from "./pages/DiscoverPage";
import MatchesPage from "./pages/MatchesPage";
import ChatPage from "./pages/ChatPage";
import ProfilePage from "./pages/ProfilePage";
import ConfessionPage from "./pages/ConfessionPage";
import SettingsPage from "./pages/SettingsPage";
import BlindDatePage from "./pages/BlindDatePage";

// Components
import Navbar from "./components/Navbar";
import MoodSelector from "./components/MoodSelector";
import ErrorBoundary from "./components/ErrorBoundary";
import CallManager from "./components/CallManager";

// Hooks
import useAuth from "./hooks/useAuth";
import useHeartbeat from "./hooks/useHeartbeat";
import useSubscription from "./hooks/useSubscription";
import { profileAPI, wsURL, authAPI } from "./api";
import { useEffect } from "react";
import SubscriptionPaywall from "./components/SubscriptionPaywall";

export default function App() {
  const [screen, setScreen] = useState("splash");
  const [tab, setTab] = useState("discover");
  const [chatMatch, setChatMatch] = useState(null);
  const [showMood, setShowMood] = useState(false);
  const [matchToast, setMatchToast] = useState("");

  const auth = useAuth();
  useHeartbeat(screen === "app");
  
  const subscription = useSubscription(screen === "app");

  useEffect(() => {
    if (screen !== "app") return;

    let ws = null;
    let reconnectTimeout = null;

    const connect = async () => {
      try {
        const res = await authAPI.getWsTicket();
        if (!res || !res.ticket) return;
        const url = wsURL.notifications(res.ticket);
        ws = new WebSocket(url);

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.type === "match_notification") {
              setMatchToast("Congratulations! You have a new match! 💖");
              setTimeout(() => setMatchToast(""), 4000);
              window.dispatchEvent(new Event("new_match"));
            }
            if (data.type === "new_message") {
              window.dispatchEvent(new CustomEvent("new_message", { detail: data.data }));
            }
          } catch (err) {
            console.error("Error parsing notification message:", err);
          }
        };

        ws.onclose = () => {
          reconnectTimeout = setTimeout(() => {
            if (screen === "app") {
              connect();
            }
          }, 5000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (err) {
        console.error("Failed to connect to notifications websocket:", err);
      }
    };

    connect();

    return () => {
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      if (reconnectTimeout) {
        clearTimeout(reconnectTimeout);
      }
    };
  }, [screen]);

  const checkOnboarding = async () => {
    try {
      const profile = await profileAPI.getMyProfile();
      // Profile must be discoverable before entering the app feed
      if (profile?.is_discoverable) {
        setScreen("app");
        setShowMood(true);
      } else {
        setScreen("onboarding");
      }
    } catch {
      // Fallback to app in case of errors/offline demo mode
      setScreen("app");
    }
  };

  const handleSplashDone = async () => {
    const loggedIn = await auth.loadUser();
    if (loggedIn) {
      await checkOnboarding();
    } else {
      setScreen("auth");
    }
  };

  const handleLogin = async () => {
    await checkOnboarding();
  };

  const handleLogout = async () => {
    await auth.logout();
    setScreen("auth");
    setShowMood(false);
    setTab("discover");
  };

  const openChat = (match) => {
    setChatMatch(match);
    setTab("chat");
  };

  if (screen === "splash") return <SplashPage onDone={handleSplashDone} />;
  if (screen === "auth") return <AuthPage auth={auth} onLogin={handleLogin} />;
  if (screen === "onboarding") {
    return (
      <OnboardingPage
        onComplete={() => {
          setScreen("app");
          setShowMood(true);
        }}
      />
    );
  }

  return (
    <div style={styles.shell}>
      <Navbar tab={tab} setTab={setTab} onLogout={handleLogout} user={auth.user} />

      <main className="mobileTopNavPadding" style={styles.main}>
        <ErrorBoundary>
          {tab === "discover" && <DiscoverPage user={auth.user} setTab={setTab} />}
          {tab === "blind_date" && <BlindDatePage user={auth.user} />}
          {tab === "matches" && <MatchesPage onOpenChat={openChat} />}
          {tab === "chat" && <ChatPage initialMatch={chatMatch} />}
          {tab === "profile" && <ProfilePage />}
          {tab === "confessions" && <ConfessionPage />}
          {tab === "settings" && <SettingsPage onLogout={handleLogout} />}
        </ErrorBoundary>
      </main>

      {showMood && <MoodSelector onDone={() => setShowMood(false)} />}

      {matchToast && (
        <div style={toastStyles.wrap}>
          <div style={toastStyles.toast}>{matchToast}</div>
        </div>
      )}
      
      {/* Global WebRTC calling controller */}
      {screen === "app" && <CallManager user={auth.user} />}

      {/* Global Subscription Paywall when trial expires */}
      {screen === "app" && subscription.status && !subscription.hasAccess && subscription.requiresSubscription && (
        <SubscriptionPaywall
          status={subscription.status}
          loading={subscription.loading}
          onPurchase={subscription.purchase}
          allowClose={false}
          title="Trial expired"
          subtitle="Subscribe to use the application and keep discovering, matching, and chatting."
        />
      )}
    </div>
  );
}

const toastStyles = {
  wrap: {
    position: "fixed",
    top: 24,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 3000,
    pointerEvents: "none",
  },
  toast: {
    background: "var(--dark-600)",
    border: "0.5px solid var(--pink)",
    borderRadius: 24,
    padding: "12px 28px",
    fontSize: 14,
    color: "var(--white)",
    fontWeight: 600,
    fontFamily: "var(--font-display)",
    boxShadow: "0 8px 32px rgba(255,31,107,0.35)",
    whiteSpace: "nowrap",
  },
};

const styles = {
  shell: { display: "flex", minHeight: "100vh", background: "var(--dark-950)" },
  main: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    minWidth: 0,
    minHeight: 0,
    height: "100dvh",
    maxHeight: "100dvh",
  },
};
