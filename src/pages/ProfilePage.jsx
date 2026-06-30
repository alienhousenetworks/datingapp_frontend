import React, { useState, useEffect, useRef } from "react";
import { profileAPI, verificationAPI, geoAPI, optionsAPI, imageAPI, subscriptionAPI } from "../api";
import useSubscription from "../hooks/useSubscription";
import profileStyles from "../styles/ProfilePage.module.css";
import ThemeSettings from "../components/ThemeSettings";

const ALL_VIBES = [
  "dry texter",
  "f1 fanatic",
  "memer",
  "night owl",
  "foodie",
  "traveller",
  "gym rat",
  "bookworm",
  "introvert",
  "extrovert",
  "overthinker",
  "dog person",
  "cat person",
  "coffee addict",
  "music nerd",
];

export default function ProfilePage() {
  const [username, setUsername] = useState("");
  const [age, setAge] = useState("");
  const [bio, setBio] = useState("");
  const [hottakes, setHottakes] = useState([]);
  const [intent, setIntent] = useState("dating");
  const [vibes, setVibes] = useState([]);
  const [images, setImages] = useState([]);
  const [verification, setVerification] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // New features state
  const [gender, setGender] = useState("");
  const [isGenderReadOnly, setIsGenderReadOnly] = useState(false);
  const [city, setCity] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  
  const [lat, setLat] = useState(null);
  const [lon, setLon] = useState(null);
  const [genderOpts, setGenderOpts] = useState([]);
  const [intentOpts, setIntentOpts] = useState([]);
  
  const [languages, setLanguages] = useState([]);
  const [sexuality, setSexuality] = useState("");
  const [turnOns, setTurnOns] = useState([]);
  const [sexualityOpts, setSexualityOpts] = useState([]);
  const [turnOnOpts, setTurnOnOpts] = useState([]);
  const [languageOpts, setLanguageOpts] = useState([]);

  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [challenge, setChallenge] = useState(null);
  const [selfieFile, setSelfieFile] = useState(null);
  const [facialId, setFacialId] = useState("");
  const [verifying, setVerifying] = useState(false);
  const fileInputRef = useRef(null);
  const [replaceImageId, setReplaceImageId] = useState(null);
  
  const subscription = useSubscription(true);

  // ── Load real profile on mount ──────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        const [profile, verif, genders, intents, sexualities, turnOnsList, languagesList] = await Promise.all([
          profileAPI.getMyProfile(),
          verificationAPI.getStatus(),
          optionsAPI.getGenders().catch(() => []),
          optionsAPI.getIntents().catch(() => []),
          optionsAPI.getSexualities().catch(() => []),
          optionsAPI.getTurnOns().catch(() => []),
          optionsAPI.getLanguages().catch(() => []),
        ]);
        if (genders && Array.isArray(genders)) setGenderOpts(genders);
        if (intents && Array.isArray(intents)) setIntentOpts(intents);
        if (sexualities) setSexualityOpts(sexualities);
        if (turnOnsList) setTurnOnOpts(turnOnsList);
        if (languagesList) setLanguageOpts(languagesList);
        if (profile) {
          setUsername(profile.username || "");
          setAge(profile.age || "");
          setBio(profile.bio || "");
          // intent comes back as PK (UUID) from the API
          setIntent(profile.intent || "");
          setImages(profile.images || []);
          setGender(profile.gender || "");
          setIsGenderReadOnly(!!profile.gender);
          setLat(profile.latitude || null);
          setLon(profile.longitude || null);
          setSexuality(profile.sexuality || "");
          setLanguages(profile.languages || []);
          setTurnOns(profile.turn_ons || []);
          setHottakes(profile.hottakes || []);
          
          if (profile.city) {
            setCity(profile.city);
          }
          // turn_ons as vibes
          if (profile.turn_ons?.length > 0) {
            setVibes(profile.turn_ons.map((t) => t.name || t));
          }
          // Load location if possible (and not already set)
          if ((!profile.latitude || !profile.longitude) && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
              async (pos) => {
                const latVal = pos.coords.latitude;
                const lonVal = pos.coords.longitude;
                setLat(latVal);
                setLon(lonVal);
                try {
                  const geo = await geoAPI.reverseGeocode(latVal, lonVal);
                  if (geo && geo.display_name) {
                    setCity(geo.display_name);
                  }
                } catch {}
              },
              () => {},
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
            );
          }
        }
        if (verif) setVerification(verif);
        if (genders) setGenderOpts(genders);
      } catch {}
      setLoading(false);
    };
    load();
  }, []);

  const toggleVibe = (v) =>
    setVibes((vs) => (vs.includes(v) ? vs.filter((x) => x !== v) : [...vs, v]));

  const handleSlotClick = (imgId = null) => {
    setReplaceImageId(imgId);
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const moveImage = async (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= images.length) return;
    const reordered = [...images];
    const [item] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, item);
    const payload = reordered.map((img, i) => ({ id: img.id, order: i + 1 }));
    setSaving(true);
    try {
      await imageAPI.reorder(payload);
      setImages(reordered);
    } catch (err) {
      alert(err.message || "Failed to reorder images");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSaving(true);
    try {
      if (replaceImageId) {
        await imageAPI.delete(replaceImageId);
      }
      await imageAPI.upload(file);
      // Wait a moment and then reload profile images because celery processing is async
      setTimeout(async () => {
        try {
          const profile = await profileAPI.getMyProfile();
          setImages(profile.images || []);
        } catch {}
      }, 1000);
      alert("Image upload initiated! It will appear on your profile shortly.");
    } catch (err) {
      console.error(err);
      alert("Failed to upload image. Please try again.");
    } finally {
      setSaving(false);
      setReplaceImageId(null);
      e.target.value = "";
    }
  };

  // ── Save to real API ────────────────────────────────────
  const save = async () => {
    setSaving(true);
    try {
      // Build PATCH payload — only include fields being changed
      const payload = { bio, languages, sexuality, turn_ons: turnOns, hottakes };
      if (username) payload.username = username.trim().toLowerCase();
      if (age) payload.age = parseInt(age);
      if (city) payload.city = city;
      if (!lat || !lon) {
        alert("Location is mandatory. Please enable location permissions and click 'Detect' before saving.");
        setSaving(false);
        return;
      }

      if (lat) payload.latitude = parseFloat(parseFloat(lat).toFixed(6));
      if (lon) payload.longitude = parseFloat(parseFloat(lon).toFixed(6));
      // Only send intent if it's a valid non-empty value
      if (intent) payload.intent = intent;
      // Only set gender if it hasn't been locked yet
      if (gender && !isGenderReadOnly) payload.gender = gender;

      await profileAPI.updateMyProfile(payload);
      if (gender) setIsGenderReadOnly(true);
      setSaved(true);
      window.dispatchEvent(new Event("profile_updated"));
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      alert(`Save failed: ${err.message || 'Check your connection'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── Start verification ──────────────────────────────────
  const startVerification = async () => {
    try {
      const challenge = await verificationAPI.getChallenge();
      if (challenge && challenge.provider) {
        setChallenge(challenge);
        setShowVerifyModal(true);
      } else {
        alert("No verification challenge returned");
      }
    } catch {
      alert("Could not start verification");
    }
  };



  const detectAndReverseGeocode = () => {
    if (!navigator.geolocation) {
      alert("Geolocation is not supported by your browser");
      return;
    }
    setLocationLoading(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const latVal = pos.coords.latitude;
          const lonVal = pos.coords.longitude;
          setLat(latVal);
          setLon(lonVal);
          const geo = await geoAPI.reverseGeocode(latVal, lonVal);
          if (geo && geo.display_name) {
            setCity(geo.display_name);
          } else {
            alert("Could not reverse geocode your location");
          }
        } catch {
          alert("Reverse geocoding failed");
        } finally {
          setLocationLoading(false);
        }
      },
      () => {
        alert("Location access denied or timed out");
        setLocationLoading(false);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  };

  const handleDeepFaceUpload = async () => {
    if (!selfieFile || !challenge) return;
    setVerifying(true);
    try {
      const res = await verificationAPI.upload(challenge.pose_type, selfieFile);
      if (res.status === "PROCESSING" || res.status === "SUCCESS") {
        alert("Selfie uploaded successfully! Under review.");
        setShowVerifyModal(false);
        setSelfieFile(null);
        const verif = await verificationAPI.getStatus();
        if (verif) setVerification(verif);
      } else {
        alert(res.error || "Upload failed");
      }
    } catch {
      alert("Error uploading selfie");
    } finally {
      setVerifying(false);
    }
  };

  const handleFaceIOComplete = async () => {
    if (!facialId) return;
    setVerifying(true);
    try {
      const res = await verificationAPI.completeFaceIO(facialId);
      if (res.status === "SUCCESS") {
        alert(res.message || "FaceIO verification completed successfully!");
        setShowVerifyModal(false);
        setFacialId("");
        const verif = await verificationAPI.getStatus();
        if (verif) setVerification(verif);
      } else {
        alert(res.error || "FaceIO verification failed");
      }
    } catch {
      alert("Error submitting FaceIO details");
    } finally {
      setVerifying(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          ...styles.page,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ color: "var(--dark-300)", fontSize: 14 }}>
          Loading profile…
        </p>
      </div>
    );
  }

  return (
    <div style={styles.page} className={profileStyles.page}>
      <div style={styles.header} className={profileStyles.header}>
        <div>
          <h1 style={styles.title} className={profileStyles.title}>Your Profile</h1>
          <p style={styles.sub} className={profileStyles.sub}>How others see you</p>
        </div>
        <button
          style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
          className={profileStyles.saveBtn}
          onClick={save}
          disabled={saving}
        >
          {saving ? "Saving..." : saved ? "✓ Saved!" : "Save changes"}
        </button>
      </div>

      <div style={styles.body} className={profileStyles.body}>
        {/* Left column */}
        <div style={styles.left} className={profileStyles.left}>
          {/* Photo grid */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>Photos</div>
            <div style={styles.photoGrid}>
              {/* Real images */}
              {images.slice(0, 6).map((img, i) => (
                <div
                  key={img.id}
                  style={{ ...styles.photoSlot, ...styles.photoFilled }}
                  onClick={() => handleSlotClick(img.id)}
                >
                  <img
                    src={img.image_url}
                    alt=""
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                      position: "absolute",
                      top: 0,
                      left: 0,
                    }}
                    onError={(e) => {
                      e.target.style.display = "none";
                    }}
                  />
                  <div style={styles.photoOverlay}>
                    <span>✎</span>
                    <div
                      style={styles.reorderBtns}
                      onClick={(e) => e.stopPropagation()}
                    >
                      {i > 0 && (
                        <button
                          type="button"
                          style={styles.reorderBtn}
                          onClick={() => moveImage(i, -1)}
                          title="Move earlier"
                        >
                          ←
                        </button>
                      )}
                      {i < images.length - 1 && (
                        <button
                          type="button"
                          style={styles.reorderBtn}
                          onClick={() => moveImage(i, 1)}
                          title="Move later"
                        >
                          →
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {/* Empty slots */}
              {Array(Math.max(0, 6 - images.length))
                .fill(0)
                .map((_, i) => (
                  <div
                    key={`empty-${i}`}
                    style={styles.photoSlot}
                    onClick={() => handleSlotClick(null)}
                  >
                    <span style={styles.photoAdd}>+</span>
                  </div>
                ))}
            </div>
            <p style={styles.photoNote}>
              Add up to 6 photos · First photo is your main pic
            </p>
          </div>

          <ThemeSettings />

          {/* Verification */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>Verification</div>
            <div style={styles.verifyRow}>
              <div style={styles.verifyIcon}>✓</div>
              <div>
                <div style={styles.verifyTitle}>Email verified</div>
                <div style={styles.verifySub}>
                  {verification?.verification_status === "VERIFIED"
                    ? "Selfie verified ✓"
                    : verification?.verification_status === "PROCESSING"
                      ? "Selfie under review…"
                      : "Selfie verification pending"}
                </div>
              </div>
              {verification?.verification_status !== "VERIFIED" && (
                <button style={styles.verifyBtn} onClick={startVerification}>
                  Verify now
                </button>
              )}
            </div>
          </div>

          {/* Subscription Status */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>Subscription</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {subscription.loading ? (
                <div style={{ fontSize: 13, color: "var(--dark-300)" }}>Loading subscription...</div>
              ) : subscription.status?.is_free ? (
                <div style={styles.verifySub}>You are on a free tier.</div>
              ) : (
                <>
                  <div style={{ fontSize: 14, color: "var(--white)", fontWeight: 600 }}>
                    {subscription.hasAccess ? "Premium Trial Active ✨" : "Trial Expired 🔒"}
                  </div>
                  
                  {subscription.hasAccess && subscription.trialDaysRemaining > 0 && (
                    <div style={{ fontSize: 13, color: "var(--teal)" }}>
                      {subscription.trialDaysRemaining} day(s) of trial remaining.
                    </div>
                  )}
                  
                  <button
                    style={styles.verifyBtn}
                    onClick={subscription.purchase}
                    disabled={subscription.loading}
                  >
                    {subscription.loading ? "Processing..." : "Subscribe to Premium"}
                  </button>
                  <p style={{ fontSize: 11, color: "var(--dark-300)" }}>
                    Unlock full access.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={styles.right} className={profileStyles.right}>
          {/* Basic info */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>Basic Info</div>
            <label style={styles.fieldLabel}>Username</label>
            <input
              style={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value.replace(/\s/g, ""))}
              placeholder="your_username"
              autoComplete="username"
            />
            <label style={styles.fieldLabel}>Age</label>
            <input
              style={{ ...styles.input, width: 100 }}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Age"
              type="number"
            />
            <label style={styles.fieldLabel}>Gender</label>
            <select
              style={{ ...styles.input, cursor: isGenderReadOnly ? "not-allowed" : "pointer" }}
              value={gender}
              onChange={(e) => setGender(e.target.value)}
              disabled={isGenderReadOnly}
            >
              <option value="">Select Gender</option>
              {genderOpts.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
            {isGenderReadOnly && (
              <p style={{ ...styles.fieldNote, marginTop: -8, marginBottom: 12, color: "var(--dark-400)" }}>
                Gender cannot be changed once set.
              </p>
            )}
            <label style={styles.fieldLabel}>Sexuality</label>
            <select
              style={{ ...styles.input, cursor: "pointer" }}
              value={sexuality}
              onChange={(e) => setSexuality(e.target.value)}
            >
              <option value="">Select Sexuality</option>
              {sexualityOpts.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <label style={styles.fieldLabel}>Location</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <button
                style={{ ...styles.locationBtn, flex: 1, padding: "10px", borderRadius: "12px", background: "var(--dark-700)", color: "var(--white)", border: "1px solid var(--dark-500)", cursor: "pointer", fontFamily: "var(--font-display)", fontWeight: 600 }}
                onClick={detectAndReverseGeocode}
                disabled={locationLoading}
              >
                {locationLoading ? "Detecting Location..." : "📍 Auto-Detect Location"}
              </button>
            </div>
            <div style={styles.activeCityBadge}>
              Active Location: <strong>{city || (lat && lon ? `${parseFloat(lat).toFixed(2)}, ${parseFloat(lon).toFixed(2)}` : "Location not detected (Mandatory)")}</strong>
            </div>
            <label style={styles.fieldLabel}>About you</label>
            <textarea
              style={styles.textarea}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Write something about yourself…"
            />
            <label style={styles.fieldLabel}>Intent</label>
            <select
              style={{ ...styles.input, cursor: "pointer" }}
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
            >
              <option value="">Select intent...</option>
              {intentOpts.length > 0
                ? intentOpts.map(opt => (
                    <option key={opt.id} value={opt.id}>{opt.name}</option>
                  ))
                : [
                    <option key="dating" value="dating">Dating</option>,
                    <option key="friends" value="friends">Friends</option>,
                    <option key="casual" value="casual">Casual</option>,
                    <option key="serious" value="serious">Serious</option>,
                  ]
              }
            </select>
          </div>

          {/* Languages */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>
              Languages{" "}
              <span style={styles.vibeCount}>{languages.length} selected</span>
            </div>
            <div style={styles.vibesGrid}>
              {languageOpts.map((l) => (
                <span
                  key={l.id}
                  style={{
                    ...styles.vibe,
                    ...(languages.includes(l.name) ? styles.vibeOn : styles.vibeOff),
                  }}
                  onClick={() => {
                    setLanguages(prev =>
                      prev.includes(l.name) ? prev.filter(x => x !== l.name) : [...prev, l.name]
                    );
                  }}
                >
                  {l.name}
                </span>
              ))}
            </div>
          </div>

          {/* Turn Ons */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>
              Turn Ons{" "}
              <span style={styles.vibeCount}>{turnOns.length} selected</span>
            </div>
            <div style={styles.vibesGrid}>
              {turnOnOpts.map((t) => (
                <span
                  key={t.id}
                  style={{
                    ...styles.vibe,
                    ...(turnOns.includes(t.id) ? styles.vibeOn : styles.vibeOff),
                  }}
                  onClick={() => {
                    setTurnOns(prev =>
                      prev.includes(t.id) ? prev.filter(x => x !== t.id) : [...prev, t.id]
                    );
                  }}
                >
                  {t.name}
                </span>
              ))}
            </div>
          </div>

          {/* Hot takes */}
          <div style={styles.card}>
            <div style={styles.cardLabel}>
              Your Hot Takes{" "}
              <span style={styles.vibeCount}>{hottakes.length}/3 selected</span>
            </div>
            <p style={styles.fieldNote}>
              Add up to 3 hot takes to show on your profile — make them spicy 🌶
            </p>
            {hottakes.map((take, idx) => (
              <div key={idx} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <input
                  style={{ ...styles.input, marginBottom: 0 }}
                  value={take}
                  onChange={(e) => {
                    const newTakes = [...hottakes];
                    newTakes[idx] = e.target.value;
                    setHottakes(newTakes);
                  }}
                  placeholder={`Hot take #${idx + 1}`}
                />
                <button
                  type="button"
                  style={{
                    background: "rgba(239, 68, 68, 0.2)",
                    color: "#EF4444",
                    border: "0.5px solid rgba(239, 68, 68, 0.4)",
                    borderRadius: "50%",
                    width: 32,
                    height: 32,
                    cursor: "pointer",
                    fontSize: 14,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0
                  }}
                  onClick={() => {
                    setHottakes(hottakes.filter((_, i) => i !== idx));
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
            {hottakes.length < 3 && (
              <button
                type="button"
                style={{
                  ...styles.locationBtn,
                  width: "100%",
                  padding: "10px",
                  borderRadius: "12px",
                  background: "var(--dark-700)",
                  color: "var(--white)",
                  border: "1px solid var(--dark-500)",
                  cursor: "pointer",
                  fontFamily: "var(--font-display)",
                  fontWeight: 600,
                  marginTop: 8
                }}
                onClick={() => setHottakes([...hottakes, ""])}
              >
                + Add Hot Take
              </button>
            )}
          </div>
        </div>
      </div>

      <button
        style={{ ...styles.saveBtn, opacity: saving ? 0.7 : 1 }}
        className={profileStyles.mobileSaveBtn}
        onClick={save}
        disabled={saving}
      >
        {saving ? "Saving..." : saved ? "✓ Saved!" : "Save changes"}
      </button>

      {showVerifyModal && challenge && (
        <>
          <div style={styles.backdrop} onClick={() => setShowVerifyModal(false)} />
          <div style={styles.modal}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Selfie Verification 🤳</h3>
              <button style={styles.closeBtn} onClick={() => setShowVerifyModal(false)}>✕</button>
            </div>
            
            {challenge.provider === "deepface" ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={styles.challengeBox}>
                  <div style={styles.challengePose}>Pose Required: <strong>{challenge.pose_type}</strong></div>
                  <p style={styles.challengeInstructions}>{challenge.instructions || "Pose for the selfie!"}</p>
                </div>
                
                <label style={styles.fileInputLabel}>
                  📁 Choose Selfie Image
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={(e) => setSelfieFile(e.target.files[0])}
                  />
                </label>
                {selfieFile && <div style={{ fontSize: 12, color: "var(--teal)", textAlign: "center" }}>Selected: {selfieFile.name}</div>}
                
                <button
                  style={{ ...styles.submitVerifyBtn, opacity: verifying || !selfieFile ? 0.6 : 1 }}
                  onClick={handleDeepFaceUpload}
                  disabled={verifying || !selfieFile}
                >
                  {verifying ? "Uploading..." : "Submit Selfie"}
                </button>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div style={styles.challengeBox}>
                  <div style={styles.challengePose}>FaceIO Verification</div>
                  <p style={styles.challengeInstructions}>
                    App ID: <code>{challenge.app_id}</code><br/>
                    Please complete facial verification using the button below or submit your Facial ID manually if completed.
                  </p>
                  <a
                    href={challenge.redirect_url}
                    target="_blank"
                    rel="noreferrer"
                    style={styles.faceioLinkBtn}
                  >
                    Launch FaceIO Web Verification ↗
                  </a>
                </div>
                
                <label style={styles.fieldLabel}>Facial ID</label>
                <input
                  style={styles.input}
                  value={facialId}
                  onChange={(e) => setFacialId(e.target.value)}
                  placeholder="Enter faceio-facial-id-string..."
                />
                
                <button
                  style={{ ...styles.submitVerifyBtn, opacity: verifying || !facialId ? 0.6 : 1 }}
                  onClick={handleFaceIOComplete}
                  disabled={verifying || !facialId}
                >
                  {verifying ? "Completing..." : "Submit Facial ID"}
                </button>
              </div>
            )}
          </div>
        </>
      )}
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        accept="image/*"
        onChange={handleImageUpload}
      />
    </div>
  );
}

const styles = {
  page: { flex: 1, overflowY: "auto", padding: "0 0 40px" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "24px 32px 16px",
    borderBottom: "0.5px solid var(--dark-700)",
  },
  title: {
    fontFamily: "var(--font-display)",
    fontSize: 26,
    fontWeight: 700,
    color: "var(--white)",
  },
  sub: { fontSize: 12, color: "var(--dark-300)", marginTop: 4 },
  saveBtn: {
    padding: "10px 22px",
    borderRadius: 24,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 13,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
    boxShadow: "0 4px 18px rgba(255,31,107,0.3)",
  },
  body: {
    display: "flex",
    gap: 20,
    padding: "24px 32px",
    alignItems: "flex-start",
  },
  left: {
    width: 280,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  right: { flex: 1, display: "flex", flexDirection: "column", gap: 16 },
  card: {
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 16,
    padding: "18px 20px",
  },
  cardLabel: {
    fontFamily: "var(--font-display)",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--dark-300)",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    marginBottom: 14,
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  photoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, 1fr)",
    gap: 8,
    marginBottom: 10,
  },
  photoSlot: {
    aspectRatio: "1",
    borderRadius: 12,
    background: "var(--dark-600)",
    border: "0.5px dashed var(--dark-400)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    cursor: "pointer",
    position: "relative",
    overflow: "hidden",
  },
  photoFilled: {
    background: "linear-gradient(135deg,#2a0a1a,#72243E)",
    border: "0.5px solid rgba(255,31,107,0.3)",
  },
  photoOverlay: {
    position: "absolute",
    inset: 0,
    background: "rgba(0,0,0,0.5)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    fontSize: 14,
    color: "#fff",
    opacity: 0,
  },
  reorderBtns: { display: "flex", gap: 4 },
  reorderBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    border: "none",
    background: "rgba(255,255,255,0.2)",
    color: "#fff",
    fontSize: 11,
    cursor: "pointer",
  },
  photoAdd: { fontSize: 20, color: "var(--dark-400)" },
  photoNote: { fontSize: 10, color: "var(--dark-300)", lineHeight: 1.5 },
  verifyRow: { display: "flex", alignItems: "center", gap: 12 },
  verifyIcon: {
    width: 36,
    height: 36,
    borderRadius: "50%",
    background: "rgba(0,212,170,0.15)",
    border: "0.5px solid rgba(0,212,170,0.4)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "var(--teal)",
    fontSize: 16,
    flexShrink: 0,
  },
  verifyTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--white)",
  },
  verifySub: { fontSize: 11, color: "var(--dark-300)", marginTop: 2 },
  verifyBtn: {
    marginLeft: "auto",
    padding: "6px 14px",
    borderRadius: 20,
    background: "var(--pink-dim)",
    border: "0.5px solid rgba(255,31,107,0.3)",
    color: "var(--pink-soft)",
    fontSize: 11,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "var(--font-display)",
  },
  fieldLabel: {
    display: "block",
    fontSize: 10,
    fontWeight: 600,
    color: "var(--dark-300)",
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    marginBottom: 6,
    fontFamily: "var(--font-display)",
  },
  fieldNote: {
    fontSize: 11,
    color: "var(--dark-300)",
    marginBottom: 8,
    lineHeight: 1.5,
  },
  input: {
    width: "100%",
    height: 40,
    borderRadius: 10,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 14,
    padding: "0 14px",
    color: "var(--white)",
    outline: "none",
    marginBottom: 12,
    boxSizing: "border-box",
  },
  textarea: {
    width: "100%",
    height: 68,
    borderRadius: 10,
    border: "0.5px solid var(--dark-500)",
    background: "var(--dark-700)",
    fontSize: 13,
    padding: "10px 14px",
    color: "var(--white)",
    outline: "none",
    resize: "none",
    lineHeight: 1.55,
    marginBottom: 4,
    boxSizing: "border-box",
  },
  vibesGrid: { display: "flex", flexWrap: "wrap", gap: 8 },
  vibeCount: {
    color: "var(--pink-soft)",
    fontSize: 10,
    fontWeight: 400,
    letterSpacing: 0,
  },
  vibe: {
    fontSize: 12,
    padding: "7px 14px",
    borderRadius: 20,
    cursor: "pointer",
    fontWeight: 500,
    transition: "all 0.15s",
  },
  vibeOn: {
    background: "var(--pink)",
    color: "#fff",
    border: "0.5px solid var(--pink)",
  },
  vibeOff: {
    background: "var(--dark-700)",
    color: "var(--dark-100)",
    border: "0.5px solid var(--dark-500)",
  },
  locationBtn: {
    padding: "0 16px",
    borderRadius: 10,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--white)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
  },
  suggestionsContainer: {
    background: "var(--dark-900)",
    border: "0.5px solid var(--dark-500)",
    borderRadius: 10,
    maxHeight: 200,
    overflowY: "auto",
    marginBottom: 12,
  },
  suggestionItem: {
    padding: "10px 14px",
    fontSize: 13,
    color: "var(--white)",
    cursor: "pointer",
    borderBottom: "0.5px solid var(--dark-700)",
    transition: "background 0.15s",
  },
  activeCityBadge: {
    fontSize: 12,
    color: "var(--pink-soft)",
    background: "var(--pink-dim)",
    border: "0.5px solid rgba(255,31,107,0.2)",
    borderRadius: 8,
    padding: "8px 12px",
    marginBottom: 12,
  },
  backdrop: {
    position: "fixed",
    inset: 0,
    background: "rgba(0,0,0,0.6)",
    zIndex: 200,
    backdropFilter: "blur(2px)",
  },
  modal: {
    position: "fixed",
    top: "50%",
    left: "50%",
    transform: "translate(-50%,-50%)",
    width: "90%",
    maxWidth: 420,
    background: "var(--dark-800)",
    border: "0.5px solid var(--dark-600)",
    borderRadius: 20,
    padding: "24px",
    zIndex: 201,
  },
  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontFamily: "var(--font-display)",
    fontSize: 18,
    fontWeight: 700,
    color: "var(--white)",
    margin: 0,
  },
  closeBtn: {
    background: "none",
    border: "none",
    color: "var(--dark-300)",
    fontSize: 16,
    cursor: "pointer",
  },
  challengeBox: {
    background: "var(--dark-700)",
    borderRadius: 12,
    padding: "14px",
    borderLeft: "3px solid var(--pink)",
  },
  challengePose: {
    fontSize: 14,
    color: "var(--white)",
    fontWeight: 600,
    marginBottom: 6,
  },
  challengeInstructions: {
    fontSize: 12,
    color: "var(--dark-200)",
    lineHeight: 1.5,
    margin: 0,
  },
  fileInputLabel: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 44,
    borderRadius: 22,
    background: "var(--dark-700)",
    border: "0.5px solid var(--dark-500)",
    color: "var(--white)",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 0.2s",
  },
  submitVerifyBtn: {
    height: 44,
    borderRadius: 22,
    background: "var(--pink)",
    border: "none",
    color: "#fff",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    boxShadow: "0 4px 16px rgba(255,31,107,0.3)",
    transition: "opacity 0.2s",
  },
  faceioLinkBtn: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    borderRadius: 19,
    background: "var(--pink-dim)",
    border: "0.5px solid rgba(255,31,107,0.3)",
    color: "var(--pink-soft)",
    fontSize: 12,
    fontWeight: 600,
    marginTop: 10,
    textDecoration: "none",
  },
};
