import React from "react";
import styles from "../styles/AuthPage.module.css";

/**
 * AuthPage — full-screen login with OTP flow.
 * Uses the useAuth hook passed in from App.jsx.
 */
export default function AuthPage({ auth, onLogin }) {
  const {
    step,
    email,
    setEmail,
    otp,
    setOtp,
    loading,
    error,
    msg,
    requestOTP,
    verifyOTP,
    resendOTP,
    goBack,
  } = auth;

  return (
    <div className={styles.page}>
      {/* Left: branding panel */}
      <div className={styles.left}>
        <div className={styles.glow} />
        <div className={styles.logoWrap}>
          <div className={styles.logo}>
            sp<span style={{ color: "var(--pink)" }}>y</span>ce{" "}
          </div>
          <p className={styles.tagline}>
            no fake vibes.
            <br />
            just real ones.
          </p>
        </div>
        <div className={styles.features}>
          {[
            "Real profiles, real people",
            "Hot takes > bios",
            "Chat that actually lands",
            "Gen Z built, India first",
          ].map((f) => (
            <div key={f} className={styles.featureItem}>
              <div className={styles.featureDot} />
              <span>{f}</span>
            </div>
          ))}
        </div>
        <div className={styles.bottomTag}>
          Spreading everywhere.
        </div>
      </div>

      {/* Right: form panel */}
      <div className={styles.right}>
        <div className={styles.formCard}>
          <div className={styles.formLogo}>
            sp<span style={{ color: "var(--pink)" }}>y</span>ce{" "}
          </div>

          {step === "email" ? (
            <>
              <h2 className={styles.formTitle}>Welcome back</h2>
              <p className={styles.formSub}>Enter your email to get started</p>

              <label className={styles.label}>Email address</label>
              <input
                className={styles.input}
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && requestOTP()}
                autoFocus
              />
              <button
                className={styles.btn}
                style={{ opacity: !email || loading ? 0.6 : 1 }}
                onClick={requestOTP}
                disabled={!email || loading}
              >
                {loading ? "Sending OTP..." : "Get OTP →"}
              </button>
            </>
          ) : (
            <>
              <h2 className={styles.formTitle}>Check your email</h2>
              <p
                className={styles.formSub}
                style={{ color: "var(--teal)", marginBottom: 20 }}
              >
                {msg || `OTP sent to ${email}`}
              </p>

              <label className={styles.label}>Enter OTP</label>
              <input
                className={styles.input}
                style={{
                  letterSpacing: "0.3em",
                  fontSize: 22,
                  textAlign: "center",
                }}
                type="text"
                placeholder="• • • • • •"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && verifyOTP(onLogin)}
                autoFocus
              />
              <button
                className={styles.btn}
                style={{
                  opacity: otp.length < 4 || loading ? 0.6 : 1,
                }}
                onClick={() => verifyOTP(onLogin)}
                disabled={otp.length < 4 || loading}
              >
                {loading ? "Verifying..." : "Let me in →"}
              </button>

              <button
                className={styles.backBtn}
                onClick={resendOTP}
                disabled={loading}
                style={{ marginBottom: 8 }}
              >
                {loading ? "Sending…" : "Resend OTP"}
              </button>
              <button className={styles.backBtn} onClick={goBack}>
                ← Back
              </button>
            </>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <p className={styles.demoNote}>
            💡 Demo mode: backend offline? Just click the button — it'll skip to
            the app.
          </p>
        </div>
      </div>
    </div>
  );
}
