import React from "react";

export default function SubscriptionPaywall({
  status,
  loading,
  onPurchase,
  onClose,
  title = "Premium required",
  subtitle,
  allowClose = true,
}) {
  const price = status?.price || "9.99";
  const currency = status?.currency || "USD";
  const trialLeft = status?.trial_days_remaining ?? 0;

  return (
    <div style={styles.overlay}>
      <div style={styles.card}>
        {allowClose && <button style={styles.close} onClick={onClose} type="button">✕</button>}
        <div style={styles.icon}>✨</div>
        <h2 style={styles.title}>{title}</h2>
        <p style={styles.sub}>
          {subtitle ||
            (trialLeft > 0
              ? `Your free trial has ${trialLeft} day(s) left on other features.`
              : "Upgrade to keep swiping, matching, and chatting.")}
        </p>

        {status?.is_free ? (
          <p style={styles.freeNote}>Your profile tier includes free access — refresh the page.</p>
        ) : (
          <>
            <div style={styles.priceBox}>
              <span style={styles.price}>{price}</span>
              <span style={styles.currency}>{currency}</span>
              <span style={styles.duration}>
                / {status?.subscription_duration_days || 30} days
              </span>
            </div>
            <button
              style={styles.btn}
              onClick={onPurchase}
              disabled={loading}
              type="button"
            >
              {loading ? "Processing..." : "Upgrade now"}
            </button>
            <p style={styles.note}>Payment is a staging placeholder — access activates immediately.</p>
          </>
        )}
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.75)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2000,
    padding: 20,
  },
  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-500)",
    borderRadius: 20,
    padding: "32px 28px",
    maxWidth: 400,
    width: "100%",
    textAlign: "center",
    position: "relative",
  },
  close: {
    position: "absolute",
    top: 14,
    right: 14,
    background: "none",
    border: "none",
    color: "var(--dark-200)",
    fontSize: 18,
    cursor: "pointer",
  },
  icon: { fontSize: 40, marginBottom: 12 },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 8,
  },
  sub: { fontSize: 13, color: "var(--dark-200)", lineHeight: 1.5, marginBottom: 20 },
  priceBox: { marginBottom: 20 },
  price: {
    fontFamily: "var(--font-display)",
    fontSize: 36,
    fontWeight: 800,
    color: "var(--pink)",
  },
  currency: { fontSize: 14, color: "var(--dark-200)", marginLeft: 4 },
  duration: { display: "block", fontSize: 12, color: "var(--dark-300)", marginTop: 4 },
  btn: {
    width: "100%",
    padding: "14px 20px",
    borderRadius: 12,
    border: "none",
    background: "var(--pink)",
    color: "#fff",
    fontFamily: "var(--font-display)",
    fontWeight: 700,
    fontSize: 15,
    cursor: "pointer",
  },
  note: { fontSize: 11, color: "var(--dark-300)", marginTop: 12 },
  freeNote: { fontSize: 13, color: "var(--teal)" },
};