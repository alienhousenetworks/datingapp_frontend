import React, { useState, useEffect, useCallback, useRef } from "react";
import FeedProfileItem from "../components/FeedProfileItem";
import SubscriptionPaywall from "../components/SubscriptionPaywall";
import { feedAPI, interactionAPI, optionsAPI, subscriptionAPI } from "../api";
import useSubscription from "../hooks/useSubscription";
import discoverStyles from "../styles/DiscoverPage.module.css";

const DISTANCE_FILTER_OPTIONS = [
  { value: 10, label: "10 km" },
  { value: 50, label: "50 km" },
  { value: 80, label: "80 km" },
  { value: 100, label: "100 km" },
  { value: 200, label: "200 km" },
  { value: 0, label: "Anywhere" },
];

const formatDistanceFilterLabel = (distance) => {
  if (distance === 0) return "Anywhere";
  return `${distance} km`;
};

const DEFAULT_FILTERS = {
  min_age: 18,
  max_age: 100,
  distance: 0,
  intent: "",
  currently_online: false,
  gender: [],
};

function mapFeedItem(r) {
  const profile = r.profile || r;
  return {
    id: r.id || profile.user_id || profile.id,
    ...profile,
    can_direct_message: r.can_direct_message ?? profile.can_direct_message,
    theme: profile.theme,
    is_boosted: r.is_boosted,
  };
}

export default function DiscoverPage({ user, setTab }) {
  const [profiles, setProfiles] = useState([]);
  const [selected, setSelected] = useState(null);
  const [toast, setToast] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [cursor, setCursor] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLocked, setIsLocked] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [paywallStatus, setPaywallStatus] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [activeFilter, setActiveFilter] = useState(null);
  const [intentOpts, setIntentOpts] = useState([]);
  const [genderOpts, setGenderOpts] = useState([]);
  const [purchasing, setPurchasing] = useState(false);
  const layoutRef = useRef(null);
  const gridRef = useRef(null);

  const subscription = useSubscription(false);

  // Measure feed viewport height for snap cards (mobile)
  useEffect(() => {
    const layout = layoutRef.current;
    const grid = gridRef.current;
    if (!layout || !grid) return;

    const syncHeight = () => {
      if (window.innerWidth >= 1000) {
        grid.style.removeProperty("--feed-slot-height");
        return;
      }
      const h = layout.getBoundingClientRect().height;
      if (h > 0) grid.style.setProperty("--feed-slot-height", `${Math.round(h)}px`);
    };

    syncHeight();
    const ro = new ResizeObserver(syncHeight);
    ro.observe(layout);
    window.addEventListener("resize", syncHeight);
    const t1 = requestAnimationFrame(syncHeight);
    const t2 = setTimeout(syncHeight, 150);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", syncHeight);
      cancelAnimationFrame(t1);
      clearTimeout(t2);
    };
  }, [activeFilter, isLocked, showPaywall, profiles.length, loading]);

  useEffect(() => {
    optionsAPI.getIntents().then(setIntentOpts).catch(() => {});
    optionsAPI.getGenders().then(setGenderOpts).catch(() => {});
  }, []);

  const loadFeed = useCallback(async (cur = 0, activeFilters = filters, append = false) => {
    if (cur === 0) setLoading(true);
    else setLoadingMore(true);

    try {
      const data = await feedAPI.getFeed(20, cur, activeFilters);
      setIsLocked(false);
      setShowPaywall(false);
      const results = (data.results || []).map(mapFeedItem);

      if (results.length > 0) {
        setProfiles((prev) => (append ? [...prev, ...results] : results));
        const next = data.next_cursor != null ? parseInt(data.next_cursor, 10) : null;
        setCursor(next ?? 0);
        setHasMore(next != null);
      } else {
        if (!append) setProfiles([]);
        setHasMore(false);
      }
    } catch (err) {
      if (err.status === 403) {
        if (err.data?.code === "subscription_required" || err.data?.error?.includes?.("subscription")) {
          setShowPaywall(true);
          setPaywallStatus({
            price: err.data.price,
            currency: err.data.currency,
            subscription_duration_days: err.data.subscription_duration_days,
            trial_days_remaining: 0,
          });
          subscription.refresh();
        } else if (err.data?.verification_status || err.data?.feed_unlocked === false) {
          setIsLocked(true);
        }
      }
      if (!append) setProfiles([]);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [filters, subscription]);

  useEffect(() => {
    loadFeed(0, filters, false);
  }, []);



  const applyFilters = (next) => {
    setFilters(next);
    setActiveFilter(null);
    setCursor(0);
    loadFeed(0, next, false);
  };

  const showToast = (text) => {
    setToast(text);
    setTimeout(() => setToast(null), 1800);
  };

  const handleLike = async (profile) => {
    try {
      const res = await interactionAPI.like(profile.id);
      if (res.status === "match") {
        showToast(`🎉 It's a match with ${profile.username ? `@${profile.username}` : "them"}!`);
        window.dispatchEvent(new Event("new_match"));
      } else {
        showToast(`♥ You liked ${profile.username ? `@${profile.username}` : "them"}!`);
      }
      setSelected(null);
    } catch (err) {
      if (err.status === 403 && err.data?.code === "subscription_required") {
        setShowPaywall(true);
        subscription.refresh();
      } else {
        showToast(`Failed to like ${profile.username ? `@${profile.username}` : "them"}. Please try again.`);
        if (err.data?.details) {
          alert("Server Error Details: " + err.data.details);
        }
      }
      throw err;
    }
  };

  const handlePass = async (profile) => {
    try {
      await interactionAPI.pass(profile.id);
      showToast(`Passed on ${profile.username ? `@${profile.username}` : "them"}`);
      setProfiles((ps) => ps.filter((p) => p.id !== profile.id));
      setSelected(null);
    } catch (err) {
      if (err.status === 403 && err.data?.code === "subscription_required") {
        setShowPaywall(true);
        subscription.refresh();
      } else {
        showToast(`Failed to pass on ${profile.username ? `@${profile.username}` : "them"}. Please try again.`);
      }
    }
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      await subscriptionAPI.purchase(`sub_${Date.now()}`);
      setShowPaywall(false);
      showToast("✨ Premium activated!");
      loadFeed(0, filters, false);
    } catch (err) {
      showToast(err.message || "Purchase failed");
    } finally {
      setPurchasing(false);
    }
  };

  const toggleGender = (genderId) => {
    const g = filters.gender.includes(genderId)
      ? filters.gender.filter((x) => x !== genderId)
      : [...filters.gender, genderId];
    applyFilters({ ...filters, gender: g });
  };

  return (
    <div style={styles.page} className={discoverStyles.page}>
      <div className={discoverStyles.pageHeader} style={styles.pageHeader}>
        <div className={discoverStyles.headerText}>
          <h1 className={discoverStyles.title} style={styles.title}>Discover</h1>
          <p className={discoverStyles.sub} style={styles.sub}>
            {loading ? "Loading..." : `${profiles.length} people near you`}
          </p>
        </div>
        <div className={discoverStyles.filters} style={styles.filters}>
          <button
            className={discoverStyles.filterBtn}
            style={{
              ...styles.filterBtn,
              ...(activeFilter === "age" ? styles.filterBtnActive : {}),
            }}
            onClick={() => setActiveFilter(activeFilter === "age" ? null : "age")}
          >
            Age {filters.min_age}–{filters.max_age} ▾
          </button>
          <button
            className={discoverStyles.filterBtn}
            style={{
              ...styles.filterBtn,
              ...(activeFilter === "distance" ? styles.filterBtnActive : {}),
            }}
            onClick={() =>
              setActiveFilter(activeFilter === "distance" ? null : "distance")
            }
          >
            {formatDistanceFilterLabel(filters.distance)} ▾
          </button>
          <button
            className={discoverStyles.filterBtn}
            style={{
              ...styles.filterBtn,
              ...(activeFilter === "intent" ? styles.filterBtnActive : {}),
            }}
            onClick={() =>
              setActiveFilter(activeFilter === "intent" ? null : "intent")
            }
          >
            Vibes ▾
          </button>
          <button
            className={discoverStyles.filterBtn}
            style={{
              ...styles.filterBtn,
              ...(filters.currently_online ? styles.filterBtnActive : {}),
            }}
            onClick={() =>
              applyFilters({
                ...filters,
                currently_online: !filters.currently_online,
              })
            }
          >
            {filters.currently_online ? "🟢 Online" : "Online"}
          </button>
        </div>
      </div>

      {activeFilter && (
        <div className={discoverStyles.filterPanel} style={styles.filterPanel}>
          {activeFilter === "age" && (
            <div style={styles.filterRow}>
              <label style={styles.filterLabel}>
                Min age
                <input
                  type="range"
                  min={18}
                  max={60}
                  value={filters.min_age}
                  onChange={(e) =>
                    setFilters({ ...filters, min_age: parseInt(e.target.value) })
                  }
                />
                <span>{filters.min_age}</span>
              </label>
              <label style={styles.filterLabel}>
                Max age
                <input
                  type="range"
                  min={18}
                  max={60}
                  value={filters.max_age}
                  onChange={(e) =>
                    setFilters({ ...filters, max_age: parseInt(e.target.value) })
                  }
                />
                <span>{filters.max_age}</span>
              </label>
              <button style={styles.applyBtn} onClick={() => applyFilters(filters)}>
                Apply
              </button>
            </div>
          )}
          {activeFilter === "distance" && (
            <div style={styles.filterRow}>
              {DISTANCE_FILTER_OPTIONS.map(({ value, label }) => (
                <button
                  key={value}
                  style={{
                    ...styles.distChip,
                    ...(filters.distance === value ? styles.distChipOn : {}),
                  }}
                  onClick={() => applyFilters({ ...filters, distance: value })}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
          {activeFilter === "intent" && (
            <div style={styles.filterRow}>
              <button
                style={{
                  ...styles.distChip,
                  ...(!filters.intent ? styles.distChipOn : {}),
                }}
                onClick={() => applyFilters({ ...filters, intent: "" })}
              >
                Any
              </button>
              {intentOpts.map((opt) => (
                <button
                  key={opt.id}
                  style={{
                    ...styles.distChip,
                    ...(filters.intent === opt.id ? styles.distChipOn : {}),
                  }}
                  onClick={() => applyFilters({ ...filters, intent: opt.id })}
                >
                  {opt.name}
                </button>
              ))}
              {genderOpts.length > 0 && (
                <>
                  <span style={styles.filterDivider}>Gender</span>
                  {genderOpts.map((g) => (
                    <button
                      key={g.id}
                      style={{
                        ...styles.distChip,
                        ...(filters.gender.includes(g.id) ? styles.distChipOn : {}),
                      }}
                      onClick={() => toggleGender(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {toast && <div style={styles.toast}>{toast}</div>}

      <div ref={layoutRef} className={discoverStyles.layout} style={styles.layout}>
        <div ref={gridRef} className={discoverStyles.grid} style={styles.grid}>
          {isLocked ? (
            <div
              className={discoverStyles.lockedContainer}
              style={styles.lockedContainer}
            >
              <div style={styles.lockIcon}>🔒</div>
              <h2 style={styles.lockTitle}>Verification Required</h2>
              <p style={styles.lockText}>
                Complete selfie verification on your profile to unlock discovery.
              </p>
              <button
                style={styles.verifyBtn}
                onClick={() => setTab && setTab("profile")}
              >
                Verify Profile
              </button>
            </div>
          ) : loading && profiles.length === 0 ? (
            [1, 2].map((i) => (
              <div key={i} className={discoverStyles.skeleton} style={styles.skeleton} />
            ))
          ) : profiles.length === 0 ? (
            <div className={discoverStyles.empty} style={styles.empty}>
              <div style={{ fontSize: 40 }}>🌸</div>
              <p style={styles.emptyText}>You've seen everyone nearby!</p>
              <button
                style={styles.verifyBtn}
                onClick={() => loadFeed(0, DEFAULT_FILTERS, false)}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <>
              {profiles.map((p) => (
                <FeedProfileItem
                  key={p.id}
                  profile={p}
                  onLike={handleLike}
                  onPass={handlePass}
                />
              ))}
              {hasMore && (
                <div className={discoverStyles.loadMoreWrap} style={styles.loadMoreWrap}>
                  <button
                    style={styles.loadMoreBtn}
                    onClick={() => loadFeed(cursor, filters, true)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showPaywall && (
        <SubscriptionPaywall
          status={paywallStatus || subscription.status}
          loading={purchasing || subscription.loading}
          onPurchase={handlePurchase}
          onClose={() => setShowPaywall(false)}
          title="Trial expired"
          subtitle="Upgrade to keep discovering, matching, and chatting."
        />
      )}
    </div>
  );
}

const styles = {
  page: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    position: "relative",
    minHeight: 0,
  },
  pageHeader: {
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
  },
  sub: { fontSize: 12, color: "var(--dark-300)", marginTop: 4 },
  filters: { display: "flex", gap: 8, flexWrap: "wrap" },
  filterBtn: {
    padding: "7px 14px",
    borderRadius: 20,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-100)",
    fontSize: 12,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
  },
  filterBtnActive: {
    background: "var(--pink-dim)",
    borderColor: "rgba(255,31,107,0.4)",
    color: "var(--pink-soft)",
  },
  filterPanel: {
    padding: "12px 28px 16px",
    borderBottom: "0.5px solid var(--dark-700)",
    background: "var(--dark-900)",
  },
  filterRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    alignItems: "center",
  },
  filterLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    color: "var(--dark-200)",
  },
  applyBtn: {
    padding: "6px 16px",
    borderRadius: 16,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
  },
  distChip: {
    padding: "6px 14px",
    borderRadius: 20,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    fontSize: 12,
    cursor: "pointer",
  },
  distChipOn: {
    background: "var(--pink-dim)",
    borderColor: "rgba(255,31,107,0.4)",
    color: "var(--pink-soft)",
  },
  filterDivider: {
    fontSize: 10,
    color: "var(--dark-400)",
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    width: "100%",
    marginTop: 4,
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
    fontFamily: "var(--font-display)",
    fontWeight: 600,
    zIndex: 100,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  },
  layout: { flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minHeight: 0 },
  grid: {},
  skeleton: {
    height: "calc(100vh - 140px)",
    minHeight: 500,
    width: "100%",
    maxWidth: 600,
    borderRadius: 24,
    background: "var(--dark-700)",
    opacity: 0.5,
    scrollSnapAlign: "start",
  },
  empty: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "80px 0",
    gap: 10,
  },
  emptyText: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    color: "var(--dark-200)",
  },
  lockedContainer: {
    gridColumn: "1 / -1",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: "40px 24px",
    background: "rgba(25, 25, 25, 0.4)",
    backdropFilter: "blur(8px)",
    border: "0.5px solid var(--dark-700)",
    borderRadius: 24,
    maxWidth: 360,
    margin: "40px auto",
    textAlign: "center",
  },
  lockIcon: { fontSize: 48, marginBottom: 16 },
  lockTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 8,
  },
  lockText: {
    fontSize: 13,
    color: "var(--dark-200)",
    lineHeight: 1.5,
    marginBottom: 20,
  },
  verifyBtn: {
    padding: "10px 24px",
    borderRadius: 20,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    boxShadow: "0 4px 16px rgba(255,31,107,0.3)",
  },
  loadMoreWrap: {
    gridColumn: "1 / -1",
    display: "flex",
    justifyContent: "center",
    padding: "8px 0 24px",
  },
  loadMoreBtn: {
    padding: "10px 28px",
    borderRadius: 24,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-100)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
  },
};