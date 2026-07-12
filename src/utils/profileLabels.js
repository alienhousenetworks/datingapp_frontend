const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return typeof value === "string" && UUID_RE.test(value);
}

/** Prefer *_detail.name; never surface raw option UUIDs in the UI. */
export function getOptionLabel(detail, rawValue, fallback = null) {
  if (detail?.name) return detail.name;
  if (rawValue != null && rawValue !== "" && !isUuid(rawValue)) return String(rawValue);
  return fallback;
}

export function getGenderLabel(profile, fallback = "Unknown") {
  return getOptionLabel(profile?.gender_detail, profile?.gender, fallback);
}

export function getSexualityLabel(profile, fallback = "Unknown") {
  return getOptionLabel(profile?.sexuality_detail, profile?.sexuality, fallback);
}

export function getIntentLabel(profile) {
  return getOptionLabel(profile?.intent_detail, profile?.intent, null);
}

export function getMoodLabel(profile) {
  const moods = profile?.current_moods_detail;
  if (Array.isArray(moods) && moods.length > 0) {
    return moods.map((m) => m.name).filter(Boolean).join(", ");
  }
  const legacyMood = profile?.current_mood;
  if (legacyMood && !isUuid(legacyMood)) return legacyMood;
  return null;
}