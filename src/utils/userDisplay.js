export function getUserDisplayName(user) {
  if (user?.username) return `@${user.username}`;
  return "User";
}

export function getUserInitial(user) {
  const handle = user?.username || "";
  return handle[0]?.toUpperCase() || "?";
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9._]{3,30}$/;

export function normalizeUsername(value) {
  return (value || "").trim().toLowerCase();
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(normalizeUsername(value));
}

export function getProfileHandle(profile) {
  if (profile?.username) return `@${profile.username}`;
  return "Unknown";
}

export function getProfileInitial(profile) {
  const handle = profile?.username || "";
  return handle[0]?.toUpperCase() || "?";
}