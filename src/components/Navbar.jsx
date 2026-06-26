import React, { useEffect, useState } from "react";
import { userAPI, profileAPI, matchAPI } from "../api";
import { isCompactNav } from "../constants/breakpoints";
import css from "../styles/Navbar.module.css";
const navItems = [
  { id: "discover", label: "Discover", icon: "⬡" },
  { id: "blind_date", label: "Blind Date", icon: "🎭" },
  { id: "matches", label: "Matches", icon: "♥" },
  { id: "chat", label: "Messages", icon: "✉" },
  { id: "confessions", label: "Confessions", icon: "🤫" },
  { id: "profile", label: "Profile", icon: "◉" },
  { id: "settings", label: "Settings", icon: "⚙" },
];

export default function Navbar({ tab, setTab, onLogout }) {
  const [userName, setUserName] = useState("You");
  const [userInitial, setUserInitial] = useState("Y");
  const [userCity, setUserCity] = useState("Location not set");
  const [matchCount, setMatchCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const [compactNav, setCompactNav] = useState(isCompactNav);

  const toggleMenu = () => setMenuOpen((prev) => !prev);
  const closeMenu = () => setMenuOpen(false);
  const handleNavClick = (id) => {
    setTab(id);
    if (menuOpen) {
      closeMenu();
    }
  };

  useEffect(() => {
    const updateNavLayout = () => {
      const compact = isCompactNav();
      setCompactNav(compact);
      if (!compact) {
        setMenuOpen(false);
      }
    };

    updateNavLayout();
    window.addEventListener("resize", updateNavLayout);
    return () => window.removeEventListener("resize", updateNavLayout);
  }, []);

  useEffect(() => {
    document.body.classList.toggle("compact-nav", compactNav);
    return () => document.body.classList.remove("compact-nav");
  }, [compactNav]);

  useEffect(() => {
    const load = async () => {
      try {
        const profile = await profileAPI.getMyProfile();
        if (profile?.name) {
          setUserName(profile.name);
          setUserInitial(profile.name[0].toUpperCase());
        } else {
          const user = await userAPI.getMe();
          if (user?.email) {
            const n = user.email.split("@")[0];
            setUserName(n);
            setUserInitial(n[0].toUpperCase());
          }
        }
        if (profile) {
          setUserCity(profile.city || profile.state || profile.country || "Location not set");
        }
      } catch (err) {}
      try {
        const matches = await matchAPI.getMatches();
        setMatchCount(Array.isArray(matches) ? matches.length : 0);
      } catch (err) {}
    };
    load();

    const handleNewMatch = async () => {
      try {
        const matches = await matchAPI.getMatches();
        setMatchCount(Array.isArray(matches) ? matches.length : 0);
      } catch (err) {}
    };

    window.addEventListener("new_match", handleNewMatch);
    window.addEventListener("profile_updated", load);
    return () => {
      window.removeEventListener("new_match", handleNewMatch);
      window.removeEventListener("profile_updated", load);
    };
  }, []);

  return (
    <div className={compactNav ? css.compact : css.desktop}>
      <div className={css.mobileBar}>
        {!menuOpen && (
          <button
            type="button"
            className={css.hamburger}
            onClick={toggleMenu}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <path
                d="M4 7h16M4 12h16M4 17h16"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        )}
        <div className={css.mobileLogo}>
          sp<span style={{ color: "var(--pink)" }}>y</span>ce
        </div>
      </div>

      {menuOpen && <div className={css.overlay} onClick={closeMenu} />}

      <nav className={`${css.nav} ${menuOpen ? css.navOpen : ""}`}>
        <button
          type="button"
          className={css.closeButton}
          onClick={closeMenu}
          aria-label="Close navigation menu"
        >
          <svg
            viewBox="0 0 24 24"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
          >
            <path
              d="M18 6L6 18M6 6l12 12"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className={css.logo} style={styles.logo}>
          sp<span style={{ color: "var(--pink)" }}>y</span>ce{" "}
        </div>

        <div className={css.navLinks} style={styles.links}>
          {navItems.map((item) => {
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                style={{
                  ...styles.navBtn,
                  background: active ? "var(--pink-dim)" : "transparent",
                  color: active ? "var(--pink-soft)" : "var(--dark-200)",
                  borderLeft: active
                    ? "2px solid var(--pink)"
                    : "2px solid transparent",
                }}
              >
                <span style={styles.navIcon}>{item.icon}</span>
                <span style={styles.navLabel}>{item.label}</span>
                {item.id === "matches" && matchCount > 0 && (
                  <span style={styles.badge}>
                    {matchCount > 9 ? "9+" : matchCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className={css.navBottom} style={styles.bottom}>
          <div style={styles.userRow}>
            <div style={styles.userAvatar}>{userInitial}</div>
            <div>
              <div style={styles.userName}>{userName}</div>
              <div style={styles.userSub}>{userCity}</div>
            </div>
          </div>
          <button onClick={onLogout} style={styles.logoutBtn}>
            Sign out
          </button>
        </div>
      </nav>
    </div>
  );
}

const styles = {
  nav: {
    width: "var(--sidebar-width)",
    minHeight: "100vh",
    background: "var(--dark-800)",
    borderRight: "0.5px solid var(--dark-600)",
    display: "flex",
    flexDirection: "column",
    padding: "28px 0",
    position: "sticky",
    top: 0,
    flexShrink: 0,
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 28,
    fontWeight: 800,
    color: "var(--white)",
    letterSpacing: "-0.04em",
    padding: "0 24px 32px",
    borderBottom: "0.5px solid var(--dark-600)",
    marginBottom: 16,
  },
  links: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "0 12px",
    flex: 1,
  },
  navBtn: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 10,
    border: "none",
    borderLeft: "2px solid transparent",
    fontSize: 14,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.18s",
    textAlign: "left",
    position: "relative",
  },
  navIcon: { fontSize: 16, width: 20, textAlign: "center" },
  navLabel: { flex: 1 },
  badge: {
    background: "var(--pink)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    borderRadius: "50%",
    width: 18,
    height: 18,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  bottom: {
    padding: "16px 16px 0",
    borderTop: "0.5px solid var(--dark-600)",
    marginTop: 16,
  },
  userRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 12 },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "var(--pink-dim)",
    border: "1px solid rgba(255,31,107,0.3)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    color: "var(--pink-soft)",
    fontSize: 15,
  },
  userName: { fontSize: 13, fontWeight: 600, color: "var(--white)" },
  userSub: { fontSize: 11, color: "var(--dark-300)", marginTop: 1 },
  logoutBtn: {
    width: "100%",
    padding: "8px 0",
    borderRadius: 8,
    background: "var(--dark-600)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    fontSize: 12,
    cursor: "pointer",
  },
};
