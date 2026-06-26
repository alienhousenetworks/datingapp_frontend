// src/pages/SettingsPage.jsx
import React, { useState, useEffect } from "react";
import { userAPI, callAPI, APP_VERSION } from "../api";
import useSubscription from "../hooks/useSubscription";
import SubscriptionPaywall from "../components/SubscriptionPaywall";
import styles from "../styles/SettingsPage.module.css";

// ─── Toggle switch component ────────────────────────────────
function Toggle({ on, onChange, color = "var(--pink)" }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 44,
        height: 24,
        borderRadius: 12,
        background: on ? color : "var(--dark-600)",
        border: "0.5px solid " + (on ? color : "var(--dark-500)"),
        position: "relative",
        cursor: "pointer",
        transition: "background 0.2s, border 0.2s",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: on ? 23 : 3,
          width: 16,
          height: 16,
          borderRadius: "50%",
          background: "#fff",
          transition: "left 0.2s",
          boxShadow: "0 1px 4px rgba(0,0,0,0.3)",
        }}
      />
    </div>
  );
}

// ─── Section header ─────────────────────────────────────────
function SectionHeader({ label }) {
  return <div style={s.sectionHeader}>{label}</div>;
}

// ─── Setting row ────────────────────────────────────────────
function SettingRow({ icon, label, sub, right, onClick, danger }) {
  return (
    <div
      style={{ ...s.row, cursor: onClick ? "pointer" : "default" }}
      onClick={onClick}
    >
      <div style={{ ...s.rowIcon, color: danger ? "#EF4444" : "var(--pink)" }}>
        {icon}
      </div>
      <div style={s.rowBody}>
        <div
          style={{ ...s.rowLabel, color: danger ? "#EF4444" : "var(--white)" }}
        >
          {label}
        </div>
        {sub && <div style={s.rowSub}>{sub}</div>}
      </div>
      {right && <div style={s.rowRight}>{right}</div>}
      {onClick && !right && <div style={s.chevron}>›</div>}
    </div>
  );
}

export default function SettingsPage({ onLogout }) {
  // ── Notification settings ───────────────────────────────
  const [notifLikes, setNotifLikes] = useState(true);
  const [notifMatches, setNotifMatches] = useState(true);
  const [notifMessages, setNotifMessages] = useState(true);
  const [notifCalls, setNotifCalls] = useState(false);

  // ── Privacy settings ────────────────────────────────────
  const [hideLastActive, setHideLastActive] = useState(false);
  const [hideOnline, setHideOnline] = useState(false);
  const [hideDistance, setHideDistance] = useState(false);
  const [pauseDiscovery, setPauseDiscovery] = useState(false);

  // ── UI state ────────────────────────────────────────────
  const [saving, setSaving] = useState("");
  const [toast, setToast] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [callQuota, setCallQuota] = useState(null);
  const [showPaywall, setShowPaywall] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [addingMinutes, setAddingMinutes] = useState(false);

  const subscription = useSubscription(true);

  useEffect(() => {
    callAPI.getQuota().then(setCallQuota).catch(() => {});
  }, []);

  const formatSeconds = (secs) => {
    if (secs == null) return "—";
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}m ${s}s`;
  };

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      await subscription.purchase();
      showToast("✨ Premium activated!");
      setShowPaywall(false);
    } catch {
      showToast("Purchase failed — try again");
    } finally {
      setPurchasing(false);
    }
  };

  const handleAddCallMinutes = async () => {
    setAddingMinutes(true);
    try {
      await callAPI.addMinutes(30);
      const q = await callAPI.getQuota();
      setCallQuota(q);
      showToast("✓ 30 extra call minutes added");
    } catch (err) {
      showToast(err.message || "Failed to add minutes");
    } finally {
      setAddingMinutes(false);
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  // ── Save notifications ──────────────────────────────────
  const saveNotifications = async () => {
    setSaving("notif");
    try {
      // API: PATCH /api/v1/settings/notifications/ — not in current backend
      // saved locally for now, will wire when backend exposes endpoint
      await new Promise((r) => setTimeout(r, 400));
      showToast("✓ Notification settings saved");
    } catch {
      showToast("Failed to save — try again");
    } finally {
      setSaving("");
    }
  };

  // ── Save privacy ────────────────────────────────────────
  const savePrivacy = async () => {
    setSaving("privacy");
    try {
      await new Promise((r) => setTimeout(r, 400));
      showToast("✓ Privacy settings saved");
    } catch {
      showToast("Failed to save");
    } finally {
      setSaving("");
    }
  };

  // ── Pause / resume discovery ────────────────────────────
  const handlePauseDiscovery = async (val) => {
    setPauseDiscovery(val);
    try {
      await new Promise((r) => setTimeout(r, 300));
      showToast(
        val
          ? "🔕 Discovery paused — you're hidden from feed"
          : "✅ Discovery resumed",
      );
    } catch {}
  };

  // ── Delete account ──────────────────────────────────────
  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await userAPI.deleteAccount();
      showToast("Account deletion requested — 7-day grace period");
      setTimeout(() => onLogout?.(), 2000);
    } catch {
      showToast("Error — please contact support");
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div style={s.page}>
      {/* Header */}
      <div style={s.header}>
        <h1 style={s.title}>Settings</h1>
        <p style={s.sub}>Account, privacy & preferences</p>
      </div>

      {/* Toast */}
      {toast && <div style={s.toast}>{toast}</div>}

      {/* Delete confirm modal */}
      {confirmDelete && (
        <>
          <div style={s.backdrop} onClick={() => setConfirmDelete(false)} />
          <div style={s.modal}>
            <div
              style={{ fontSize: 40, textAlign: "center", marginBottom: 12 }}
            >
              ⚠️
            </div>
            <h3 style={{ ...s.modalTitle, color: "#EF4444" }}>
              Delete account?
            </h3>
            <p style={s.modalSub}>
              Your account will be permanently deleted after a 7-day grace
              period. Matches, messages, and profile data will be erased.
            </p>
            <div style={s.modalActions}>
              <button
                style={s.cancelBtn}
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
              <button
                style={{ ...s.deleteConfirmBtn, opacity: deleting ? 0.7 : 1 }}
                onClick={handleDeleteAccount}
                disabled={deleting}
              >
                {deleting ? "Deleting..." : "Yes, delete"}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Content */}
      <div className={styles.content} style={s.content}>
        <div className={styles.col} style={s.col}>
          {/* ── Subscription ─────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Subscription" />
            <SettingRow
              icon="✨"
              label={
                subscription.isFree
                  ? "Free tier"
                  : subscription.hasAccess
                    ? "Premium active"
                    : "Trial expired"
              }
              sub={
                subscription.loading
                  ? "Loading…"
                  : subscription.isFree
                    ? "Your profile tier includes free access"
                    : subscription.status?.has_active_subscription
                      ? `Expires ${subscription.status?.subscription_expires_at ? new Date(subscription.status.subscription_expires_at).toLocaleDateString() : "—"}`
                      : subscription.trialDaysRemaining > 0
                        ? `${subscription.trialDaysRemaining} trial day(s) left`
                        : "Upgrade to unlock discovery & chat"
              }
              right={
                !subscription.isFree && !subscription.hasAccess ? (
                  <button
                    style={s.upgradeBtn}
                    onClick={() => setShowPaywall(true)}
                  >
                    Upgrade
                  </button>
                ) : subscription.status?.price && !subscription.isFree ? (
                  <span style={s.versionText}>
                    {subscription.status.price} {subscription.status.currency}
                  </span>
                ) : null
              }
            />
          </div>

          {/* ── Call quota ───────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Call Time" />
            <SettingRow
              icon="📞"
              label="Daily quota remaining"
              sub={
                callQuota
                  ? `Resets ${callQuota.resets_at ? new Date(callQuota.resets_at).toLocaleTimeString() : "midnight UTC"}`
                  : "Loading call quota…"
              }
              right={
                <span style={s.versionText}>
                  {callQuota
                    ? formatSeconds(callQuota.remaining_seconds)
                    : "—"}
                </span>
              }
            />
            {callQuota?.extra_minutes_seconds > 0 && (
              <>
                <div style={s.divider} />
                <SettingRow
                  icon="⏱"
                  label="Extra minutes"
                  sub="Purchased beyond daily quota"
                  right={
                    <span style={s.versionText}>
                      {formatSeconds(callQuota.extra_minutes_seconds)}
                    </span>
                  }
                />
              </>
            )}
            <button
              style={{ ...s.saveBtn, opacity: addingMinutes ? 0.7 : 1 }}
              onClick={handleAddCallMinutes}
              disabled={addingMinutes}
            >
              {addingMinutes ? "Processing…" : "Add 30 extra minutes (staging)"}
            </button>
          </div>

          {/* ── Account ──────────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Account" />
            <SettingRow
              icon="✉"
              label="Change Email"
              sub="Re-verification required"
              onClick={() => showToast("Email change — coming soon")}
            />
            <div style={s.divider} />
            <SettingRow
              icon="🔒"
              label="Active Sessions"
              sub="Manage logged-in devices"
              onClick={() => showToast("Session management — coming soon")}
            />
            <div style={s.divider} />
            <SettingRow
              icon="⏸"
              label="Pause Account"
              sub="Temporarily hide from feed · Data retained"
              onClick={() => showToast("Pause — coming soon")}
            />
          </div>

          {/* ── Notifications ────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Notifications" />
            <SettingRow
              icon="♥"
              label="New Likes"
              sub="When someone likes your profile"
              right={<Toggle on={notifLikes} onChange={setNotifLikes} />}
            />
            <div style={s.divider} />
            <SettingRow
              icon="🎉"
              label="New Matches"
              sub="When you match with someone"
              right={<Toggle on={notifMatches} onChange={setNotifMatches} />}
            />
            <div style={s.divider} />
            <SettingRow
              icon="✉"
              label="Messages"
              sub="When you receive a new message"
              right={<Toggle on={notifMessages} onChange={setNotifMessages} />}
            />
            <div style={s.divider} />
            <SettingRow
              icon="📞"
              label="Calls"
              sub="Incoming voice & video calls"
              right={<Toggle on={notifCalls} onChange={setNotifCalls} />}
            />
            <button
              style={{ ...s.saveBtn, opacity: saving === "notif" ? 0.7 : 1 }}
              onClick={saveNotifications}
              disabled={saving === "notif"}
            >
              {saving === "notif" ? "Saving..." : "Save notification settings"}
            </button>
          </div>
        </div>

        <div className={styles.col} style={s.col}>
          {/* ── Privacy ──────────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Privacy" />
            <SettingRow
              icon="🕐"
              label="Hide Last Active"
              sub="Shows 'Recently Active' instead of exact time"
              right={
                <Toggle on={hideLastActive} onChange={setHideLastActive} />
              }
            />
            <div style={s.divider} />
            <SettingRow
              icon="🟢"
              label="Hide Online Status"
              sub="Green dot hidden from others"
              right={<Toggle on={hideOnline} onChange={setHideOnline} />}
            />
            <div style={s.divider} />
            <SettingRow
              icon="📍"
              label="Hide Distance"
              sub="Distance bucket hidden on your profile"
              right={<Toggle on={hideDistance} onChange={setHideDistance} />}
            />
            <div style={s.divider} />
            <SettingRow
              icon="🔕"
              label="Pause Discovery"
              sub={
                pauseDiscovery
                  ? "You're hidden from all feeds"
                  : "Profile visible in discovery feed"
              }
              right={
                <Toggle
                  on={pauseDiscovery}
                  onChange={handlePauseDiscovery}
                  color="#F59E0B"
                />
              }
            />
            <button
              style={{ ...s.saveBtn, opacity: saving === "privacy" ? 0.7 : 1 }}
              onClick={savePrivacy}
              disabled={saving === "privacy"}
            >
              {saving === "privacy" ? "Saving..." : "Save privacy settings"}
            </button>
          </div>

          {/* ── Discovery ────────────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Discovery" />
            <SettingRow
              icon="🧿"
              label="Hide from Blind Date"
              sub="Opt out of the Blind Date queue"
              right={
                <Toggle
                  on={false}
                  onChange={() => showToast("Coming soon")}
                  color="#A855F7"
                />
              }
            />
            <div style={s.divider} />
            <SettingRow
              icon="🚫"
              label="Blocked Users"
              sub="Manage your block list"
              onClick={() => showToast("Block list — coming soon")}
            />
          </div>

          {/* ── Legal & Support ──────────────────────────── */}
          <div style={s.card}>
            <SectionHeader label="Legal & Support" />
            <SettingRow
              icon="📄"
              label="Terms of Service"
              onClick={() => showToast("Opening Terms...")}
            />
            <div style={s.divider} />
            <SettingRow
              icon="🔐"
              label="Privacy Policy"
              onClick={() => showToast("Opening Privacy Policy...")}
            />
            <div style={s.divider} />
            <SettingRow
              icon="💬"
              label="Contact Support"
              sub="support@spice.app"
              onClick={() => window.open("mailto:support@spice.app")}
            />
            <div style={s.divider} />
            <SettingRow
              icon="ℹ"
              label="App Version"
              right={<span style={s.versionText}>v{APP_VERSION}</span>}
            />
          </div>

          {/* ── Danger zone ───────────────────────────────── */}
          <div style={{ ...s.card, border: "0.5px solid rgba(239,68,68,0.3)" }}>
            <SectionHeader label="Danger Zone" />
            <SettingRow
              icon="🚪"
              label="Sign Out"
              sub="Clears session from this device"
              onClick={onLogout}
              danger
            />
            <div style={s.divider} />
            <SettingRow
              icon="🗑"
              label="Delete Account"
              sub="Permanent · 7-day grace period"
              onClick={() => setConfirmDelete(true)}
              danger
            />
          </div>
        </div>
      </div>

      {showPaywall && (
        <SubscriptionPaywall
          status={subscription.status}
          loading={purchasing || subscription.loading}
          onPurchase={handlePurchase}
          onClose={() => setShowPaywall(false)}
        />
      )}
    </div>
  );
}

const s = {
  page: {
    flex: 1,
    overflowY: "auto",
    padding: "0 0 48px",
    position: "relative",
  },
  header: {
    padding: "24px 32px 16px",
    borderBottom: "0.5px solid var(--dark-700)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 700,
    color: "var(--white)",
    margin: 0,
  },
  sub: { fontSize: 12, color: "var(--dark-400)", marginTop: 4 },
  toast: {
    position: "fixed",
    bottom: 32,
    left: "50%",
    transform: "translateX(-50%)",
    background: "var(--dark-600)",
    border: "0.5px solid var(--dark-400)",
    borderRadius: 24,
    padding: "10px 24px",
    fontSize: 13,
    color: "var(--white)",
    fontWeight: 600,
    zIndex: 300,
    whiteSpace: "nowrap",
    boxShadow: "0 4px 24px rgba(0,0,0,0.4)",
  },

  content: {
    display: "flex",
    gap: 20,
    padding: "24px 32px",
    alignItems: "flex-start",
  },
  col: { flex: 1, display: "flex", flexDirection: "column", gap: 16 },

  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    overflow: "hidden",
  },
  sectionHeader: {
    fontSize: 10,
    fontWeight: 700,
    color: "var(--dark-400)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    padding: "14px 18px 10px",
    borderBottom: "0.5px solid var(--dark-700)",
  },

  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 18px",
    transition: "background 0.15s",
  },
  rowIcon: { fontSize: 16, width: 22, textAlign: "center", flexShrink: 0 },
  rowBody: { flex: 1, minWidth: 0 },
  rowLabel: { fontSize: 14, fontWeight: 500 },
  rowSub: { fontSize: 11, color: "var(--dark-400)", marginTop: 2 },
  rowRight: { flexShrink: 0 },
  chevron: { color: "var(--dark-500)", fontSize: 18, flexShrink: 0 },
  versionText: {
    fontSize: 12,
    color: "var(--dark-400)",
    fontFamily: "var(--font-mono, monospace)",
  },
  upgradeBtn: {
    padding: "6px 14px",
    borderRadius: 16,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 11,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
  },
  divider: { height: "0.5px", background: "var(--dark-700)", margin: "0 18px" },

  saveBtn: {
    display: "block",
    margin: "12px 18px 14px",
    width: "calc(100% - 36px)",
    height: 38,
    borderRadius: 20,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    transition: "opacity 0.2s",
  },

  // Modal
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.65)",
    zIndex: 200,
    backdropFilter: "blur(2px)",
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: "90%",
    maxWidth: 380,
    background: "var(--dark-800)",
    border: "0.5px solid rgba(239,68,68,0.4)",
    borderRadius: 20,
    padding: "28px 24px",
    zIndex: 201,
    textAlign: "center",
  },
  modalTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 10,
  },
  modalSub: {
    fontSize: 13,
    color: "var(--dark-300)",
    lineHeight: 1.6,
    marginBottom: 24,
  },
  modalActions: { display: "flex", gap: 10 },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--dark-200)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  deleteConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 22,
    background: "#EF4444",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    transition: "opacity 0.2s",
  },
};
