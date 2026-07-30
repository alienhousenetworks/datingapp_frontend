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
// DISABLED / NOT SHIPPED: Blind Date page kept for reference only (store moderation).
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
import {
  shouldShowOnboarding,
  setOnboardingLocalFlag,
} from "./utils/onboarding";

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
            // Leave/unmatch/deleted partner — refresh matches + inbox immediately
            if (
              data.type === "partner_left" ||
              data.type === "conversation_deleted" ||
              data.type === "match_removed" ||
              data.type === "partner_account_deleted"
            ) {
              window.dispatchEvent(new Event("new_match"));
              window.dispatchEvent(
                new CustomEvent("new_message", { detail: data.data || data }),
              );
              window.dispatchEvent(
                new CustomEvent("partner_removed", { detail: data }),
              );
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

  const enterApp = (userId) => {
    if (userId) setOnboardingLocalFlag(userId);
    setScreen("app");
    setShowMood(true);
  };

  /**
   * Returning users must NOT be forced through signup again.
   * Use core profile fields (not only is_discoverable — that is false when
   * paused/hidden or for some older accounts).
   */
  const checkOnboarding = async (sessionUser) => {
    const userId = sessionUser?.id || auth.user?.id;
    try {
      const profile = await profileAPI.getMyProfile();
      // Token valid but profile missing / soft error payload
      if (
        profile?.error ||
        profile?.detail === "Authentication credentials were not provided."
      ) {
        setScreen("auth");
        return;
      }
      const id = userId || profile?.id || profile?.user_id;
      if (shouldShowOnboarding(profile, id)) {
        setScreen("onboarding");
      } else {
        enterApp(id);
      }
    } catch (err) {
      // Network blip after login: if we already know this user finished
      // onboarding locally, stay in the app — never re-run signup.
      if (userId && !shouldShowOnboarding(null, userId)) {
        enterApp(userId);
        return;
      }
      if (err?.status === 401 || err?.status === 403) {
        setScreen("auth");
        return;
      }
      // Prefer app over trapping returning users in onboarding on transient errors
      setScreen("app");
    }
  };

  const handleSplashDone = async () => {
    const me = await auth.loadUser();
    if (me) {
      await checkOnboarding(me);
    } else {
      setScreen("auth");
    }
  };

  const handleLogin = async (sessionUser) => {
    await checkOnboarding(sessionUser || auth.user);
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
          enterApp(auth.user?.id);
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
          {/* Blind Date NOT SHIPPED — unreachable via nav; code retained intentionally */}
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
