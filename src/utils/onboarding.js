/**
 * Frontend-only onboarding gate.
 *
 * Backend `is_discoverable` is too strict for "has finished signup":
 * it is false when paused/hidden, and for some older accounts without
 * face-verify flags even after they filled the profile once.
 *
 * Treat an account as onboarded when core signup fields are present.
 */

const MIN_BIO = 20;
const LOCAL_KEY = "spyce_onboarding_done";

export function getOnboardingLocalFlag(userId) {
  if (!userId) return false;
  try {
    return localStorage.getItem(`${LOCAL_KEY}:${userId}`) === "1";
  } catch {
    return false;
  }
}

export function setOnboardingLocalFlag(userId) {
  if (!userId) return;
  try {
    localStorage.setItem(`${LOCAL_KEY}:${userId}`, "1");
  } catch {
    /* ignore quota / private mode */
  }
}

function hasId(value) {
  if (value == null || value === "") return false;
  if (typeof value === "object") {
    return Boolean(value.id || value.pk || value.uuid);
  }
  return true;
}

function preferredGenderCount(profile) {
  const raw =
    profile?.preferred_genders ||
    profile?.preferred_genders_detail ||
    profile?.preferredGenders ||
    [];
  return Array.isArray(raw) ? raw.length : 0;
}

/**
 * True when the user already completed first-time account setup.
 * Does NOT require is_discoverable (paused/hidden users stay onboarded).
 */
export function isProfileOnboarded(profile) {
  if (!profile || typeof profile !== "object") return false;

  // Explicit flags from API when present
  if (profile.onboarding_complete === true) return true;
  if (profile.is_completed === true) return true;
  if (profile.is_discoverable === true) return true;

  const username = (profile.username || "").toString().trim();
  const dob = profile.date_of_birth || profile.dateOfBirth || profile.age;
  const gender = profile.gender ?? profile.gender_detail ?? profile.gender_id;
  const sexuality =
    profile.sexuality ?? profile.sexuality_detail ?? profile.sexuality_id;
  const bio = (profile.bio || "").toString().trim();

  const coreFilled =
    username.length >= 3 &&
    Boolean(dob) &&
    hasId(gender) &&
    hasId(sexuality) &&
    preferredGenderCount(profile) > 0 &&
    bio.length >= MIN_BIO;

  if (coreFilled) return true;

  // High completion % + username ≈ returning user mid-edit, not brand-new
  const pct = Number(profile.completion_percentage);
  if (username.length >= 3 && Number.isFinite(pct) && pct >= 50) {
    return true;
  }

  return false;
}

/**
 * Decide whether to show onboarding after login / splash.
 */
export function shouldShowOnboarding(profile, userId) {
  if (getOnboardingLocalFlag(userId)) return false;
  if (isProfileOnboarded(profile)) {
    // Keep local cache warm for faster next cold start
    setOnboardingLocalFlag(userId || profile?.id || profile?.user_id);
    return false;
  }
  return true;
}
