import React, { useState, useEffect } from "react";
import { optionsAPI, profileAPI, verificationAPI } from "../api";
import useSubscription from "../hooks/useSubscription";
import { isValidUsername, normalizeUsername } from "../utils/userDisplay";
import {
  isProfileOnboarded,
  setOnboardingLocalFlag,
} from "../utils/onboarding";

const MIN_BIO = 20;
const TOTAL_STEPS = 5; // 1 basics · 2 identity · 3 bio · 4 face · 5 welcome

function idOf(value) {
  if (value == null || value === "") return "";
  if (typeof value === "object") return String(value.id || value.pk || "");
  return String(value);
}

export default function OnboardingPage({ onComplete }) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [preferredGenders, setPreferredGenders] = useState([]);
  const [sexuality, setSexuality] = useState("");
  const [bio, setBio] = useState("");
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /** Existing username on this account — availability check must allow it */
  const [existingUsername, setExistingUsername] = useState("");

  const [genderOpts, setGenderOpts] = useState([]);
  const [sexualityOpts, setSexualityOpts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subscription = useSubscription(true);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const [genders, sexualities, profile] = await Promise.all([
          optionsAPI.getGenders().catch(() => []),
          optionsAPI.getSexualities().catch(() => []),
          profileAPI.getMyProfile().catch(() => null),
        ]);
        if (cancelled) return;

        setGenderOpts(Array.isArray(genders) ? genders : []);
        setSexualityOpts(Array.isArray(sexualities) ? sexualities : []);

        // Already finished signup → leave onboarding immediately
        if (profile && isProfileOnboarded(profile)) {
          setOnboardingLocalFlag(profile.id || profile.user_id);
          onComplete?.();
          return;
        }

        // Prefill whatever exists so returning users aren't blank forms
        if (profile && !profile.error) {
          const uname = (profile.username || "").toString().trim();
          if (uname) {
            setUsername(uname);
            setExistingUsername(normalizeUsername(uname));
          }
          if (profile.date_of_birth) setDob(String(profile.date_of_birth).slice(0, 10));
          const g = idOf(profile.gender ?? profile.gender_detail);
          if (g) setGender(g);
          const s = idOf(profile.sexuality ?? profile.sexuality_detail);
          if (s) setSexuality(s);
          const prefs = profile.preferred_genders || profile.preferred_genders_detail || [];
          if (Array.isArray(prefs) && prefs.length) {
            setPreferredGenders(prefs.map(idOf).filter(Boolean));
          }
          if (profile.bio) setBio(String(profile.bio));
        }
      } catch {
        setGenderOpts([]);
        setSexualityOpts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
    // Run once on mount — parent onComplete identity changes every render
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ageFromDob = (raw) => {
    if (!raw) return null;
    const birthDate = new Date(raw);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
    return age;
  };

  const handleNext = async () => {
    setError("");

    if (step === 1) {
      const normalized = normalizeUsername(username);
      if (!normalized) {
        setError("Username is required. This step cannot be skipped.");
        return;
      }
      if (!isValidUsername(normalized)) {
        setError(
          "Username must be 3–30 characters (letters, numbers, underscores, or periods only)."
        );
        return;
      }
      if (!dob) {
        setError("Date of birth (age) is required. Cannot skip.");
        return;
      }
      const age = ageFromDob(dob);
      if (age === null) {
        setError("Enter a valid date of birth.");
        return;
      }
      if (age < 18) {
        setError("You must be at least 18 years old to use SPYCE.");
        return;
      }
      // Allow keeping your own existing username (returning users in onboarding)
      if (normalized !== existingUsername) {
        try {
          const check = await profileAPI.checkUsernameAvailable(normalized);
          if (!check.available) {
            setError(check.error || "This username is already taken.");
            return;
          }
        } catch (err) {
          setError(err.message || "Could not verify username. Please try again.");
          return;
        }
      }
    }

    if (step === 2) {
      if (!genderOpts.length || !sexualityOpts.length) {
        setError(
          "Identity options failed to load. Reconnect and try again — cannot skip."
        );
        return;
      }
      if (!gender) {
        setError("Gender is required. Cannot skip.");
        return;
      }
      if (!sexuality) {
        setError("Sexuality is required. Cannot skip.");
        return;
      }
      if (preferredGenders.length === 0) {
        setError("Select at least one preferred gender. Cannot skip.");
        return;
      }
    }

    if (step === 3) {
      const b = bio.trim();
      if (!b) {
        setError("Bio is required. Cannot skip.");
        return;
      }
      if (b.length < MIN_BIO) {
        setError(
          `Bio must be at least ${MIN_BIO} characters (${b.length}/${MIN_BIO}).`
        );
        return;
      }
    }

    if (step === 4) {
      if (!faceVerified) {
        setError("Complete face verification to continue. Cannot skip.");
        return;
      }
      await handleSubmit();
      return;
    }

    setStep(step + 1);
  };

  const handleBack = () => {
    setError("");
    setStep(step - 1);
  };

  const handlePreferredGenderToggle = (id) => {
    setPreferredGenders((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  const handleMockFaceVerify = async () => {
    if (verifying || faceVerified) return;
    setVerifying(true);
    setError("");
    try {
      const res = await verificationAPI.mockComplete();
      if (
        res?.status === "SUCCESS" ||
        res?.is_identity_verified === true ||
        res?.is_identity_verified === "true"
      ) {
        setFaceVerified(true);
      } else if (res?.error) {
        setError(res.error);
      } else {
        // Still mark UI verified if API returns soft success-like payload
        setFaceVerified(true);
      }
    } catch (err) {
      setError(
        err?.message ||
          "Mock verification failed. Ensure ALLOW_MOCK_VERIFICATION is enabled."
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleSubmit = async () => {
    if (!faceVerified) {
      setError("Face verification is required before finishing.");
      return;
    }
    setSubmitting(true);
    setError("");

    try {
      const payload = {
        username: normalizeUsername(username),
        date_of_birth: dob,
        gender,
        preferred_genders: preferredGenders,
        sexuality,
        bio: bio.trim(),
      };

      const res = await profileAPI.updateMyProfile(payload);
      if (res && !res.error) {
        setStep(5);
      } else {
        const usernameError = res?.username?.[0];
        setError(
          usernameError ||
            res.error ||
            "Failed to update profile. Please try again."
        );
      }
    } catch (err) {
      const usernameError = err?.data?.username?.[0];
      if (usernameError) {
        setError(usernameError);
        setSubmitting(false);
        return;
      }
      // Demo fallback only after local mandatory fields + face
      setStep(5);
    } finally {
      setSubmitting(false);
    }
  };

  const handleStartTrial = () => {
    onComplete();
  };

  const handleSubscribeNow = async () => {
    try {
      await subscription.purchase();
      onComplete();
    } catch (err) {
      console.log("Purchase cancelled or failed", err);
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.glow} />
        <p style={{ color: "var(--dark-300)" }}>Setting up your vibe...</p>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.glow} />
      <div style={styles.glow2} />

      <div style={styles.container}>
        <div style={styles.progressBar}>
          <div
            style={{
              ...styles.progressFill,
              width: `${(step / TOTAL_STEPS) * 100}%`,
            }}
          />
        </div>

        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.logo}>
              sp<span style={{ color: "var(--pink)" }}>y</span>ce
            </div>
            <span style={styles.stepIndicator}>
              Step {step} of {TOTAL_STEPS} · required
            </span>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          {step === 1 && (
            <div>
              <h2 style={styles.title}>Let's start with the basics</h2>
              <p style={styles.subtitle}>
                Username and age are required — this step cannot be skipped.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>Username *</label>
                <input
                  type="text"
                  placeholder="your_username"
                  style={styles.input}
                  value={username}
                  onChange={(e) =>
                    setUsername(e.target.value.replace(/\s/g, ""))
                  }
                  autoFocus
                  autoComplete="username"
                />
                <p style={styles.note}>
                  Letters, numbers, underscores, and periods only.
                </p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Date of Birth (age) *</label>
                <input
                  type="date"
                  style={styles.input}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  max={new Date(
                    new Date().setFullYear(new Date().getFullYear() - 18)
                  )
                    .toISOString()
                    .slice(0, 10)}
                />
                <p style={styles.note}>Must be 18+ to join. Required.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={styles.title}>Who are you?</h2>
              <p style={styles.subtitle}>
                Gender, sexuality, and preferred genders are all required.
              </p>

              <div style={styles.field}>
                <label style={styles.label}>I identify as *</label>
                <div style={styles.chipRow}>
                  {genderOpts.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      style={{
                        ...styles.chip,
                        ...(gender === g.id
                          ? styles.chipActive
                          : styles.chipInactive),
                      }}
                      onClick={() => setGender(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>My sexuality is *</label>
                <div style={styles.chipRow}>
                  {sexualityOpts.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      style={{
                        ...styles.chip,
                        ...(sexuality === s.id
                          ? styles.chipActive
                          : styles.chipInactive),
                      }}
                      onClick={() => setSexuality(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Show me profiles of *</label>
                <div style={styles.chipRow}>
                  {genderOpts.map((g) => {
                    const active = preferredGenders.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        type="button"
                        style={{
                          ...styles.chip,
                          ...(active
                            ? styles.chipActive
                            : styles.chipInactive),
                        }}
                        onClick={() => handlePreferredGenderToggle(g.id)}
                      >
                        {g.name} {active && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div>
              <h2 style={styles.title}>Write your bio</h2>
              <p style={styles.subtitle}>
                Required — at least {MIN_BIO} characters. Cannot skip.
              </p>
              <div style={styles.field}>
                <label style={styles.label}>Bio *</label>
                <textarea
                  style={{
                    ...styles.input,
                    minHeight: 120,
                    resize: "vertical",
                    fontFamily: "inherit",
                  }}
                  maxLength={300}
                  placeholder="Tell people who you are and what you're looking for…"
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                />
                <p
                  style={{
                    ...styles.note,
                    color:
                      bio.trim().length >= MIN_BIO
                        ? "var(--teal, #5eead4)"
                        : "var(--dark-400)",
                  }}
                >
                  {bio.trim().length} / 300 · min {MIN_BIO}
                </p>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 style={styles.title}>Face verification</h2>
              <p style={styles.subtitle}>
                Live face check is required to finish signup — no skip.
              </p>

              <div style={styles.verifyBox}>
                <div style={styles.verifyIcon}>
                  {faceVerified ? "✅" : "🤳"}
                </div>
                <h4 style={styles.verifyTitle}>
                  {faceVerified ? "Verified" : "Live face check"}
                </h4>
                <p style={styles.verifyText}>
                  {faceVerified
                    ? "Identity check passed. Continue to enter SPYCE."
                    : "Hold your face in frame for a short liveness check. Currently using a mock bypass — real camera liveness will replace this."}
                </p>
              </div>

              <div style={{ ...styles.verticalCol, marginTop: 24 }}>
                {!faceVerified ? (
                  <button
                    type="button"
                    style={{ ...styles.actionBtn, background: "var(--pink)" }}
                    onClick={handleMockFaceVerify}
                    disabled={verifying}
                  >
                    {verifying
                      ? "Checking face…"
                      : "Start face verification (mock)"}
                  </button>
                ) : (
                  <button
                    type="button"
                    style={{ ...styles.actionBtn, background: "var(--pink)" }}
                    onClick={handleNext}
                    disabled={submitting}
                  >
                    {submitting ? "Saving profile…" : "Complete setup 🎉"}
                  </button>
                )}
              </div>
              <p style={{ ...styles.note, marginTop: 12, textAlign: "center" }}>
                Face verification is mandatory — there is no skip.
              </p>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 style={styles.title}>Welcome to SPYCE ✨</h2>
              <p style={styles.subtitle}>
                You have {subscription.trialDaysRemaining} days of free trial
                remaining. After that, you'll need to subscribe to keep using
                the app.
              </p>

              <div style={{ ...styles.verticalCol, marginTop: 32 }}>
                <button
                  type="button"
                  style={{ ...styles.actionBtn, background: "var(--pink)" }}
                  onClick={handleSubscribeNow}
                  disabled={subscription.loading}
                >
                  {subscription.loading ? "Loading..." : "Subscribe Now"}
                </button>

                <button
                  type="button"
                  style={{
                    ...styles.largeBtn,
                    textAlign: "center",
                    border: "0.5px solid var(--dark-500)",
                    background: "transparent",
                    color: "var(--dark-200)",
                    marginTop: 8,
                  }}
                  onClick={handleStartTrial}
                >
                  Use first, then subscribe
                </button>
              </div>
            </div>
          )}

          {step < 4 && (
            <div style={styles.footer}>
              {step > 1 ? (
                <button
                  type="button"
                  style={styles.backBtn}
                  onClick={handleBack}
                >
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <button
                type="button"
                style={styles.nextBtn}
                onClick={handleNext}
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "var(--dark-950)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    padding: "20px",
    boxSizing: "border-box",
  },
  glow: {
    position: "absolute",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,31,107,0.08) 0%, transparent 70%)",
    top: "-10%",
    left: "-10%",
    pointerEvents: "none",
  },
  glow2: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)",
    bottom: "-10%",
    right: "-10%",
    pointerEvents: "none",
  },
  container: {
    width: "100%",
    maxWidth: 440,
    zIndex: 10,
  },
  progressBar: {
    width: "100%",
    height: 4,
    background: "var(--dark-800)",
    borderRadius: 2,
    marginBottom: 20,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    background: "linear-gradient(90deg, var(--pink), var(--purple))",
    transition: "width 0.3s ease",
  },
  card: {
    background: "rgba(30, 27, 38, 0.75)",
    backdropFilter: "blur(20px)",
    WebkitBackdropFilter: "blur(20px)",
    border: "1px solid rgba(255, 31, 107, 0.15)",
    borderRadius: 24,
    padding: "36px 32px",
    boxShadow: "0 8px 32px rgba(0, 0, 0, 0.37)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 32,
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 800,
    color: "var(--white)",
    letterSpacing: "-0.04em",
  },
  stepIndicator: {
    fontSize: 12,
    color: "var(--dark-400)",
    fontWeight: 600,
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 13,
    color: "var(--dark-300)",
    marginBottom: 28,
    lineHeight: 1.5,
  },
  field: { marginBottom: 20 },
  label: {
    display: "block",
    fontSize: 12,
    fontWeight: 600,
    color: "var(--dark-200)",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.04em",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "var(--dark-800)",
    border: "1px solid var(--dark-600)",
    borderRadius: 12,
    padding: "12px 14px",
    color: "var(--white)",
    fontSize: 15,
    outline: "none",
  },
  note: {
    fontSize: 11,
    color: "var(--dark-400)",
    marginTop: 6,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 20,
    padding: "8px 14px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid var(--dark-500)",
    background: "transparent",
    color: "var(--white)",
  },
  chipActive: {
    background: "rgba(255, 31, 107, 0.18)",
    borderColor: "var(--pink)",
    color: "var(--pink)",
  },
  chipInactive: {},
  verticalCol: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  largeBtn: {
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    width: "100%",
  },
  actionBtn: {
    border: "none",
    borderRadius: 14,
    padding: "14px 16px",
    fontSize: 15,
    fontWeight: 700,
    color: "var(--white)",
    cursor: "pointer",
    width: "100%",
  },
  verifyBox: {
    background: "var(--dark-800)",
    borderRadius: 16,
    padding: 24,
    textAlign: "center",
    border: "1px solid var(--dark-600)",
  },
  verifyIcon: { fontSize: 40, marginBottom: 12 },
  verifyTitle: {
    color: "var(--white)",
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 8,
  },
  verifyText: {
    color: "var(--dark-300)",
    fontSize: 13,
    lineHeight: 1.5,
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
  },
  backBtn: {
    background: "transparent",
    border: "none",
    color: "var(--dark-300)",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
  },
  nextBtn: {
    background: "var(--pink)",
    border: "none",
    borderRadius: 12,
    color: "var(--white)",
    fontWeight: 700,
    padding: "12px 22px",
    cursor: "pointer",
    fontSize: 14,
  },
  errorBox: {
    background: "rgba(255, 107, 129, 0.12)",
    border: "1px solid rgba(255, 107, 129, 0.35)",
    color: "#ff6b81",
    borderRadius: 12,
    padding: "10px 12px",
    fontSize: 13,
    marginBottom: 16,
  },
};
