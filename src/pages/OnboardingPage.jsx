import React, { useState, useEffect } from "react";
import { optionsAPI, profileAPI, verificationAPI } from "../api";
import LanguagePicker from "../components/LanguagePicker";
import useSubscription from "../hooks/useSubscription";
import { isValidUsername, normalizeUsername } from "../utils/userDisplay";
import {
  isProfileOnboarded,
  setOnboardingLocalFlag,
} from "../utils/onboarding";

const MIN_BIO = 20;
// 1 basics · 2 identity · 3 languages · 4 bio · 5 face · 6 welcome
const TOTAL_STEPS = 6;

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
  const [languages, setLanguages] = useState([]);
  const [bio, setBio] = useState("");
  const [faceVerified, setFaceVerified] = useState(false);
  const [verifying, setVerifying] = useState(false);
  /** From GET /verification/status/ — FACE_VERIFICATION server flag */
  const [faceVerificationEnabled, setFaceVerificationEnabled] = useState(false);
  const [mockMode, setMockMode] = useState(true);
  /** Existing username on this account — availability check must allow it */
  const [existingUsername, setExistingUsername] = useState("");

  const [genderOpts, setGenderOpts] = useState([]);
  const [sexualityOpts, setSexualityOpts] = useState([]);
  const [languageOpts, setLanguageOpts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subscription = useSubscription(true);

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      try {
        const [genders, sexualities, langs, profile, faceStatus] =
          await Promise.all([
            optionsAPI.getGenders().catch(() => []),
            optionsAPI.getSexualities().catch(() => []),
            optionsAPI.getLanguages().catch(() => []),
            profileAPI.getMyProfile().catch(() => null),
            verificationAPI.getStatus().catch(() => null),
          ]);
        if (cancelled) return;

        setGenderOpts(Array.isArray(genders) ? genders : []);
        setSexualityOpts(Array.isArray(sexualities) ? sexualities : []);
        setLanguageOpts(Array.isArray(langs) ? langs : []);

        if (faceStatus && !faceStatus.error) {
          setFaceVerificationEnabled(!!faceStatus.face_verification);
          setMockMode(
            faceStatus.mock_mode !== false && !faceStatus.face_verification
          );
          if (faceStatus.verified) setFaceVerified(true);
        }

        if (profile && isProfileOnboarded(profile)) {
          setOnboardingLocalFlag(profile.id || profile.user_id);
          onComplete?.();
          return;
        }

        if (profile && !profile.error) {
          const uname = (profile.username || "").toString().trim();
          if (uname) {
            setUsername(uname);
            setExistingUsername(normalizeUsername(uname));
          }
          if (profile.date_of_birth)
            setDob(String(profile.date_of_birth).slice(0, 10));
          const g = idOf(profile.gender ?? profile.gender_detail);
          if (g) setGender(g);
          const s = idOf(profile.sexuality ?? profile.sexuality_detail);
          if (s) setSexuality(s);
          const prefs =
            profile.preferred_genders || profile.preferred_genders_detail || [];
          if (Array.isArray(prefs) && prefs.length) {
            setPreferredGenders(prefs.map(idOf).filter(Boolean));
          }
          if (Array.isArray(profile.languages) && profile.languages.length) {
            setLanguages(
              profile.languages.map((l) =>
                typeof l === "object" ? l.name || String(l) : String(l)
              )
            );
          }
          if (profile.bio) setBio(String(profile.bio));
        }
      } catch {
        setGenderOpts([]);
        setSexualityOpts([]);
        setLanguageOpts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    bootstrap();
    return () => {
      cancelled = true;
    };
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
      if (normalized !== existingUsername) {
        try {
          const check = await profileAPI.checkUsernameAvailable(normalized);
          if (!check.available) {
            setError(check.error || "This username is already taken.");
            return;
          }
        } catch (err) {
          setError(
            err.message || "Could not verify username. Please try again."
          );
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
      if (!languageOpts.length) {
        setError(
          "Language options failed to load. Reconnect and try again — cannot skip."
        );
        return;
      }
      if (languages.length === 0) {
        setError("Select at least one language you speak.");
        return;
      }
    }

    if (step === 4) {
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

    if (step === 5) {
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

  const useRealFace = faceVerificationEnabled && !mockMode;

  const handleFaceVerify = async () => {
    if (verifying || faceVerified) return;
    setVerifying(true);
    setError("");
    try {
      if (useRealFace) {
        // Full Amplify Face Liveness UI lives on the Flutter app.
        // Web stays on mock until @aws-amplify/ui-react-liveness is wired;
        // when FACE_VERIFICATION=true without Amplify UI, guide user to mobile.
        setError(
          "Real face liveness runs in the SPYCE mobile app (AWS Rekognition). " +
            "Complete verification there, or set FACE_VERIFICATION=False for web mock."
        );
        return;
      }
      const res = await verificationAPI.mockComplete();
      if (
        res?.status === "SUCCESS" ||
        res?.is_identity_verified === true ||
        res?.is_identity_verified === "true" ||
        res?.verified === true
      ) {
        setFaceVerified(true);
      } else if (res?.error) {
        setError(res.error);
      } else {
        setFaceVerified(true);
      }
    } catch (err) {
      setError(
        err?.message ||
          "Verification failed. If mock is disabled, set FACE_VERIFICATION=False or use the mobile app."
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
        languages,
        bio: bio.trim(),
      };

      const res = await profileAPI.updateMyProfile(payload);
      if (res && !res.error) {
        setStep(6);
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
      setStep(6);
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

  const stepMeta = {
    1: {
      title: "Let's start with the basics",
      subtitle: "Username and age are required — this step cannot be skipped.",
    },
    2: {
      title: "Who are you?",
      subtitle: "Gender, sexuality, and preferred genders are all required.",
    },
    3: {
      title: "Languages you speak",
      subtitle:
        "Pick a few popular ones — or search if yours isn't listed below.",
    },
    4: {
      title: "Write your bio",
      subtitle: `Required — at least ${MIN_BIO} characters. Cannot skip.`,
    },
    5: {
      title: "Face verification",
      subtitle: "Live face check is required to finish signup — no skip.",
    },
    6: {
      title: "Welcome to SPYCE ✨",
      subtitle: `You have ${subscription.trialDaysRemaining} days of free trial remaining. After that, you'll need to subscribe to keep using the app.`,
    },
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.bgMesh} />
        <div style={styles.orbA} />
        <p style={{ color: "var(--dark-200)", zIndex: 2 }}>
          Setting up your vibe...
        </p>
      </div>
    );
  }

  const meta = stepMeta[step] || stepMeta[1];

  return (
    <div style={styles.page}>
      <div style={styles.bgBase} />
      <div style={styles.bgMesh} />
      <div style={styles.orbA} />
      <div style={styles.orbB} />
      <div style={styles.gridOverlay} />

      <div style={styles.container}>
        {/* Segmented progress */}
        <div style={styles.progressRow}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              style={{
                ...styles.progressSeg,
                background:
                  i < step
                    ? "linear-gradient(90deg, var(--pink), #c026d3)"
                    : "rgba(255,255,255,0.08)",
              }}
            />
          ))}
        </div>

        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.logo}>
              sp<span style={{ color: "var(--pink)" }}>y</span>ce
            </div>
            <span style={styles.stepBadge}>
              {step} / {TOTAL_STEPS}
            </span>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          <h2 style={styles.title}>{meta.title}</h2>
          <p style={styles.subtitle}>{meta.subtitle}</p>

          {step === 1 && (
            <div>
              <div style={styles.field}>
                <label style={styles.label}>Username *</label>
                <div style={styles.inputShell}>
                  <span style={styles.prefix}>@</span>
                  <input
                    type="text"
                    placeholder="your_username"
                    style={styles.inputBare}
                    value={username}
                    onChange={(e) =>
                      setUsername(e.target.value.replace(/\s/g, ""))
                    }
                    autoFocus
                    autoComplete="username"
                  />
                </div>
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
            <LanguagePicker
              options={languageOpts}
              value={languages}
              onChange={setLanguages}
            />
          )}

          {step === 4 && (
            <div style={styles.field}>
              <label style={styles.label}>Bio *</label>
              <textarea
                style={{
                  ...styles.input,
                  minHeight: 140,
                  resize: "vertical",
                  fontFamily: "inherit",
                  lineHeight: 1.5,
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
          )}

          {step === 5 && (
            <div>
              <div
                style={{
                  ...styles.verifyBox,
                  borderColor: faceVerified
                    ? "rgba(52, 211, 153, 0.45)"
                    : "rgba(255,31,107,0.2)",
                }}
              >
                <div style={styles.verifyIcon}>
                  {faceVerified ? "✅" : "🤳"}
                </div>
                <h4 style={styles.verifyTitle}>
                  {faceVerified ? "Verified" : "Live face check"}
                </h4>
                <p style={styles.verifyText}>
                  {faceVerified
                    ? "Identity check passed. Continue to enter SPYCE."
                    : useRealFace
                      ? "Live camera check via Amazon Rekognition. Use the SPYCE mobile app for the full liveness flow."
                      : "Hold your face in frame for a short liveness check. Dev mock mode is on (FACE_VERIFICATION=False)."}
                </p>
              </div>

              <div style={{ ...styles.verticalCol, marginTop: 24 }}>
                {!faceVerified ? (
                  <button
                    type="button"
                    style={{ ...styles.actionBtn, background: "var(--pink)" }}
                    onClick={handleFaceVerify}
                    disabled={verifying}
                  >
                    {verifying
                      ? "Checking face…"
                      : useRealFace
                        ? "Start face verification"
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

          {step === 6 && (
            <div style={{ ...styles.verticalCol, marginTop: 8 }}>
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
          )}

          {step < 5 && (
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
                Continue →
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
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    overflow: "hidden",
    padding: "24px 16px",
    boxSizing: "border-box",
    background: "#080808",
  },
  bgBase: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(ellipse 90% 70% at 50% 0%, #1f0a14 0%, #0d0d0d 50%, #080808 100%)",
  },
  bgMesh: {
    position: "absolute",
    inset: 0,
    background:
      "radial-gradient(circle at 15% 20%, rgba(255,31,107,0.14) 0%, transparent 42%), radial-gradient(circle at 85% 75%, rgba(168,85,247,0.12) 0%, transparent 40%), radial-gradient(circle at 50% 100%, rgba(0,212,170,0.06) 0%, transparent 35%)",
    pointerEvents: "none",
  },
  orbA: {
    position: "absolute",
    width: 380,
    height: 380,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(255,31,107,0.18) 0%, transparent 70%)",
    top: "-8%",
    left: "-5%",
    filter: "blur(4px)",
    pointerEvents: "none",
  },
  orbB: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(168,85,247,0.14) 0%, transparent 70%)",
    bottom: "-6%",
    right: "-4%",
    filter: "blur(6px)",
    pointerEvents: "none",
  },
  gridOverlay: {
    position: "absolute",
    inset: 0,
    backgroundImage:
      "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
    backgroundSize: "40px 40px",
    maskImage:
      "radial-gradient(ellipse 80% 70% at 50% 40%, black 10%, transparent 75%)",
    WebkitMaskImage:
      "radial-gradient(ellipse 80% 70% at 50% 40%, black 10%, transparent 75%)",
    pointerEvents: "none",
    opacity: 0.7,
  },
  container: {
    width: "100%",
    maxWidth: 460,
    zIndex: 10,
  },
  progressRow: {
    display: "flex",
    gap: 6,
    marginBottom: 18,
  },
  progressSeg: {
    flex: 1,
    height: 4,
    borderRadius: 4,
    transition: "background 0.35s ease",
  },
  card: {
    background: "rgba(18, 14, 22, 0.82)",
    backdropFilter: "blur(24px)",
    WebkitBackdropFilter: "blur(24px)",
    border: "1px solid rgba(255, 31, 107, 0.18)",
    borderRadius: 28,
    padding: "32px 28px",
    boxShadow:
      "0 24px 64px rgba(0, 0, 0, 0.45), inset 0 1px 0 rgba(255,255,255,0.04)",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
  },
  logo: {
    fontFamily: "var(--font-display)",
    fontSize: 22,
    fontWeight: 800,
    color: "var(--white)",
    letterSpacing: "-0.04em",
  },
  stepBadge: {
    fontSize: 11,
    fontWeight: 700,
    color: "var(--pink-soft)",
    background: "rgba(255,31,107,0.12)",
    border: "1px solid rgba(255,31,107,0.25)",
    borderRadius: 20,
    padding: "5px 10px",
    letterSpacing: "0.04em",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 24,
    fontWeight: 700,
    color: "var(--white)",
    marginBottom: 8,
    letterSpacing: "-0.02em",
    lineHeight: 1.2,
  },
  subtitle: {
    fontSize: 13,
    color: "var(--dark-200)",
    marginBottom: 26,
    lineHeight: 1.55,
  },
  field: { marginBottom: 20 },
  label: {
    display: "block",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--dark-200)",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
  },
  inputShell: {
    display: "flex",
    alignItems: "center",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid var(--dark-500)",
    borderRadius: 14,
    overflow: "hidden",
  },
  prefix: {
    padding: "0 0 0 14px",
    color: "var(--dark-300)",
    fontWeight: 600,
    fontSize: 15,
  },
  inputBare: {
    flex: 1,
    border: "none",
    background: "transparent",
    padding: "13px 14px 13px 6px",
    color: "var(--white)",
    fontSize: 15,
    outline: "none",
  },
  input: {
    width: "100%",
    boxSizing: "border-box",
    background: "rgba(0,0,0,0.35)",
    border: "1px solid var(--dark-500)",
    borderRadius: 14,
    padding: "13px 14px",
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
    borderRadius: 22,
    padding: "9px 15px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    border: "1px solid var(--dark-500)",
    background: "rgba(255,255,255,0.03)",
    color: "var(--white)",
  },
  chipActive: {
    background: "rgba(255, 31, 107, 0.18)",
    borderColor: "var(--pink)",
    color: "var(--pink-soft)",
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
    background: "rgba(0,0,0,0.3)",
    borderRadius: 18,
    padding: 28,
    textAlign: "center",
    border: "1px solid var(--dark-600)",
  },
  verifyIcon: { fontSize: 44, marginBottom: 12 },
  verifyTitle: {
    color: "var(--white)",
    fontSize: 17,
    fontWeight: 700,
    marginBottom: 8,
    fontFamily: "var(--font-display)",
  },
  verifyText: {
    color: "var(--dark-200)",
    fontSize: 13,
    lineHeight: 1.55,
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 28,
    gap: 12,
  },
  backBtn: {
    background: "transparent",
    border: "1px solid var(--dark-500)",
    borderRadius: 12,
    color: "var(--dark-100)",
    fontWeight: 600,
    cursor: "pointer",
    fontSize: 14,
    padding: "11px 16px",
  },
  nextBtn: {
    background: "linear-gradient(135deg, var(--pink), #e11d68)",
    border: "none",
    borderRadius: 12,
    color: "var(--white)",
    fontWeight: 700,
    padding: "12px 22px",
    cursor: "pointer",
    fontSize: 14,
    boxShadow: "0 8px 24px rgba(255,31,107,0.3)",
    marginLeft: "auto",
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
