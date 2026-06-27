import React, { useState, useEffect } from "react";
import { optionsAPI, profileAPI } from "../api";
import useSubscription from "../hooks/useSubscription";
import { isValidUsername, normalizeUsername } from "../utils/userDisplay";

export default function OnboardingPage({ onComplete }) {
  const [step, setStep] = useState(1);
  const [username, setUsername] = useState("");
  const [dob, setDob] = useState("");
  const [gender, setGender] = useState("");
  const [preferredGenders, setPreferredGenders] = useState([]);
  const [intent, setIntent] = useState("");
  const [sexuality, setSexuality] = useState("");
  const [languages, setLanguages] = useState([]);
  const [turnOns, setTurnOns] = useState([]);
  
  // API loaded options
  const [genderOpts, setGenderOpts] = useState([]);
  const [intentOpts, setIntentOpts] = useState([]);
  const [sexualityOpts, setSexualityOpts] = useState([]);
  const [turnOnOpts, setTurnOnOpts] = useState([]);
  const [languageOpts, setLanguageOpts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const subscription = useSubscription(true);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [genders, intents, sexualities, turnOnsList, languagesList] = await Promise.all([
          optionsAPI.getGenders().catch(() => []),
          optionsAPI.getIntents().catch(() => []),
          optionsAPI.getSexualities().catch(() => []),
          optionsAPI.getTurnOns().catch(() => []),
          optionsAPI.getLanguages().catch(() => []),
        ]);
        setGenderOpts(Array.isArray(genders) ? genders : []);
        setIntentOpts(Array.isArray(intents) ? intents : []);
        setSexualityOpts(Array.isArray(sexualities) ? sexualities : []);
        setTurnOnOpts(Array.isArray(turnOnsList) ? turnOnsList : []);
        setLanguageOpts(Array.isArray(languagesList) ? languagesList : []);
      } catch {
        setGenderOpts([]);
        setIntentOpts([]);
        setSexualityOpts([]);
        setTurnOnOpts([]);
        setLanguageOpts([]);
      } finally {
        setLoading(false);
      }
    };
    fetchOptions();
  }, []);

  const handleNext = async () => {
    if (step === 1) {
      const normalized = normalizeUsername(username);
      if (!normalized || !dob) {
        setError("Please choose a username and enter your date of birth.");
        return;
      }
      if (!isValidUsername(normalized)) {
        setError("Username must be 3–30 characters (letters, numbers, underscores, or periods only).");
        return;
      }
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
    if (step === 2 && (!gender || !sexuality || preferredGenders.length === 0)) {
      setError("Please select your gender, sexuality, and at least one preferred gender.");
      return;
    }
    if (step === 3 && (languages.length === 0 || turnOns.length === 0)) {
      setError("Please select at least one language and one turn on.");
      return;
    }
    if (step === 4 && !intent) {
      setError("Please select your primary intent.");
      return;
    }
    setError("");
    setStep(step + 1);
  };

  const handleBack = () => {
    setError("");
    setStep(step - 1);
  };

  const handlePreferredGenderToggle = (id) => {
    setPreferredGenders((prev) => 
      prev.includes(id) ? prev.filter(g => g !== id) : [...prev, id]
    );
  };

  const handleLanguageToggle = (langId) => {
    setLanguages((prev) =>
      prev.includes(langId) ? prev.filter((l) => l !== langId) : [...prev, langId]
    );
  };

  const handleTurnOnToggle = (tId) => {
    setTurnOns((prev) =>
      prev.includes(tId) ? prev.filter((t) => t !== tId) : [...prev, tId]
    );
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError("");
    
    // Validate DOB age
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    if (age < 18) {
      setError("You must be at least 18 years old to use spyce.");
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        username: normalizeUsername(username),
        date_of_birth: dob,
        gender: gender,
        preferred_genders: preferredGenders,
        intent: intent,
        intents: [intent],
        sexuality: sexuality,
        languages: languages,
        turn_ons: turnOns,
      };
      
      const res = await profileAPI.updateMyProfile(payload);
      if (res && !res.error) {
        setStep(6);
      } else {
        const usernameError = res?.username?.[0];
        setError(usernameError || res.error || "Failed to update profile. Please try again.");
      }
    } catch (err) {
      const usernameError = err?.data?.username?.[0];
      if (usernameError) {
        setError(usernameError);
        setSubmitting(false);
        return;
      }
      // Demo mode fallback
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
      // User can still proceed if they cancel payment
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
          <div style={{ ...styles.progressFill, width: `${(step / 6) * 100}%` }} />
        </div>

        <div style={styles.card}>
          <div style={styles.header}>
            <div style={styles.logo}>sp<span style={{ color: "var(--pink)" }}>y</span>ce</div>
            <span style={styles.stepIndicator}>Step {step} of 6</span>
          </div>

          {error && <div style={styles.errorBox}>{error}</div>}

          {step === 1 && (
            <div>
              <h2 style={styles.title}>Let's start with the basics</h2>
              <p style={styles.subtitle}>Pick a unique username and enter your birthday.</p>
              
              <div style={styles.field}>
                <label style={styles.label}>Username</label>
                <input
                  type="text"
                  placeholder="your_username"
                  style={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
                  autoFocus
                  autoComplete="username"
                />
                <p style={styles.note}>Like Instagram — letters, numbers, underscores, and periods only.</p>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Date of Birth</label>
                <input
                  type="date"
                  style={styles.input}
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                />
                <p style={styles.note}>Must be 18+ to join.</p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h2 style={styles.title}>Who are you?</h2>
              <p style={styles.subtitle}>Select your gender identity, sexuality, and who you want to meet.</p>

              <div style={styles.field}>
                <label style={styles.label}>I identify as</label>
                <div style={styles.chipRow}>
                  {genderOpts.map((g) => (
                    <button
                      key={g.id}
                      style={{
                        ...styles.chip,
                        ...(gender === g.id ? styles.chipActive : styles.chipInactive)
                      }}
                      onClick={() => setGender(g.id)}
                    >
                      {g.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>My sexuality is</label>
                <div style={styles.chipRow}>
                  {sexualityOpts.map((s) => (
                    <button
                      key={s.id}
                      style={{
                        ...styles.chip,
                        ...(sexuality === s.id ? styles.chipActive : styles.chipInactive)
                      }}
                      onClick={() => setSexuality(s.id)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>Show me profiles of (Preferred Genders)</label>
                <div style={styles.chipRow}>
                  {genderOpts.map((g) => {
                    const active = preferredGenders.includes(g.id);
                    return (
                      <button
                        key={g.id}
                        style={{
                          ...styles.chip,
                          ...(active ? styles.chipActive : styles.chipInactive)
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
              <h2 style={styles.title}>What's your vibe?</h2>
              <p style={styles.subtitle}>Tell us what languages you speak and what catches your eye.</p>

              <div style={styles.field}>
                <label style={styles.label}>Languages I speak</label>
                <div style={styles.chipRow}>
                  {languageOpts.map((l) => {
                    const active = languages.includes(l.name);
                    return (
                      <button
                        key={l.id}
                        style={{
                          ...styles.chip,
                          ...(active ? styles.chipActive : styles.chipInactive)
                        }}
                        onClick={() => handleLanguageToggle(l.name)}
                      >
                        {l.name} {active && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div style={styles.field}>
                <label style={styles.label}>My turn ons are</label>
                <div style={styles.chipRow}>
                  {turnOnOpts.map((t) => {
                    const active = turnOns.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        style={{
                          ...styles.chip,
                          ...(active ? styles.chipActive : styles.chipInactive)
                        }}
                        onClick={() => handleTurnOnToggle(t.id)}
                      >
                        {t.name} {active && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div>
              <h2 style={styles.title}>What's your intent?</h2>
              <p style={styles.subtitle}>Be honest. It helps us match your expectations.</p>

              <div style={styles.field}>
                <label style={styles.label}>I'm looking for</label>
                <div style={styles.verticalCol}>
                  {intentOpts.map((i) => (
                    <button
                      key={i.id}
                      style={{
                        ...styles.largeBtn,
                        ...(intent === i.id ? styles.largeBtnActive : styles.largeBtnInactive)
                      }}
                      onClick={() => setIntent(i.id)}
                    >
                      <span style={styles.btnTitle}>{i.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div>
              <h2 style={styles.title}>Selfie Verification</h2>
              <p style={styles.subtitle}>Verification builds trust. You can skip this step for now.</p>
              
              <div style={styles.verifyBox}>
                <div style={styles.verifyIcon}>🤳</div>
                <h4 style={styles.verifyTitle}>Get a blue checkmark</h4>
                <p style={styles.verifyText}>
                  Verify your photos by copying a simple pose. It takes 10 seconds and boosts match rates by 3x.
                </p>
              </div>

              <div style={{ ...styles.verticalCol, marginTop: 24 }}>
                <button
                  style={{ ...styles.actionBtn, background: "var(--pink)" }}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  {submitting ? "Processing..." : "Complete Setup 🎉"}
                </button>
                
                <button
                  style={styles.skipBtn}
                  onClick={handleSubmit}
                  disabled={submitting}
                >
                  Skip verification for now
                </button>
              </div>
            </div>
          )}

          {step === 6 && (
            <div>
              <h2 style={styles.title}>Welcome to Spyce ✨</h2>
              <p style={styles.subtitle}>
                You have {subscription.trialDaysRemaining} days of free trial remaining. After that, you'll need to subscribe to keep using the app.
              </p>

              <div style={{ ...styles.verticalCol, marginTop: 32 }}>
                <button
                  style={{ ...styles.actionBtn, background: "var(--pink)" }}
                  onClick={handleSubscribeNow}
                  disabled={subscription.loading}
                >
                  {subscription.loading ? "Loading..." : "Subscribe Now"}
                </button>
                
                <button
                  style={{ ...styles.largeBtn, textAlign: "center", border: "0.5px solid var(--dark-500)", background: "transparent", color: "var(--dark-200)", marginTop: 8 }}
                  onClick={handleStartTrial}
                >
                  Use first, then subscribe
                </button>
              </div>
            </div>
          )}

          {step < 5 && (
            <div style={styles.footer}>
              {step > 1 ? (
                <button style={styles.backBtn} onClick={handleBack}>
                  ← Back
                </button>
              ) : (
                <div />
              )}
              <button style={styles.nextBtn} onClick={handleNext}>
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
    boxSizing: "border-box"
  },
  glow: {
    position: "absolute",
    width: 600,
    height: 600,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(255,31,107,0.08) 0%, transparent 70%)",
    top: "-10%",
    left: "-10%",
    pointerEvents: "none",
  },
  glow2: {
    position: "absolute",
    width: 500,
    height: 500,
    borderRadius: "50%",
    background: "radial-gradient(circle, rgba(168,85,247,0.06) 0%, transparent 70%)",
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
  errorBox: {
    background: "rgba(239, 68, 68, 0.1)",
    border: "0.5px solid rgba(239, 68, 68, 0.3)",
    borderRadius: 12,
    padding: "12px 16px",
    color: "var(--pink-soft)",
    fontSize: 13,
    marginBottom: 24,
    lineHeight: 1.4,
  },
  field: {
    marginBottom: 24,
  },
  label: {
    display: "block",
    fontSize: 10,
    fontWeight: 700,
    color: "var(--dark-300)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: "var(--font-display)",
    marginBottom: 10,
  },
  input: {
    width: "100%",
    height: 48,
    borderRadius: 12,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 15,
    padding: "0 16px",
    color: "var(--white)",
    outline: "none",
    boxSizing: "border-box",
    transition: "border-color 0.2s",
  },
  note: {
    fontSize: 11,
    color: "var(--dark-400)",
    marginTop: 6,
  },
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
  },
  chip: {
    fontSize: 13,
    padding: "10px 18px",
    borderRadius: 20,
    cursor: "pointer",
    fontWeight: 600,
    transition: "all 0.15s",
    border: "none",
  },
  chipActive: {
    background: "var(--pink)",
    color: "#fff",
    boxShadow: "0 4px 12px rgba(255, 31, 107, 0.3)",
  },
  chipInactive: {
    background: "var(--dark-700)",
    color: "var(--dark-200)",
    border: "0.5px solid var(--dark-500)",
  },
  verticalCol: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  largeBtn: {
    width: "100%",
    padding: "16px 20px",
    borderRadius: 16,
    cursor: "pointer",
    textAlign: "left",
    transition: "all 0.2s",
    border: "none",
  },
  largeBtnActive: {
    background: "rgba(255, 31, 107, 0.15)",
    border: "1px solid var(--pink)",
    color: "var(--pink-soft)",
  },
  largeBtnInactive: {
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--white)",
  },
  btnTitle: {
    fontSize: 15,
    fontWeight: 700,
  },
  verifyBox: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "20px",
    textAlign: "center",
  },
  verifyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  verifyTitle: {
    fontSize: 15,
    fontWeight: 700,
    color: "var(--white)",
    margin: "0 0 6px 0",
  },
  verifyText: {
    fontSize: 12,
    color: "var(--dark-300)",
    lineHeight: 1.6,
    margin: 0,
  },
  actionBtn: {
    width: "100%",
    height: 48,
    borderRadius: 24,
    border: "none",
    color: "#fff",
    fontSize: 15,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 18px rgba(255, 31, 107, 0.35)",
  },
  skipBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 13,
    cursor: "pointer",
    padding: "8px",
  },
  footer: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 36,
  },
  backBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
  },
  nextBtn: {
    padding: "10px 22px",
    borderRadius: 20,
    background: "var(--dark-200)",
    color: "var(--dark-950)",
    border: "none",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    marginLeft: "auto",
  }
};
