// ============================================================
// api/index.js  —  Central API layer for Dating App Frontend
// ============================================================

// Support both Create React App (REACT_APP_) and Vite (VITE_) environment configurations
export const API_BASE_URL = 
  (typeof process !== "undefined" && process.env ? process.env.REACT_APP_API_BASE_URL : null) ||
  (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_BASE_URL : null) ||
  "https://testapi.spycenow.com";

export const BASE_URL = 
  (typeof process !== "undefined" && process.env ? process.env.REACT_APP_API_V1_URL : null) ||
  (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_API_V1_URL : null) ||
  "https://testapi.spycenow.com/api/v1";

export const APP_VERSION =
  (typeof process !== "undefined" && process.env ? process.env.REACT_APP_VERSION : null) ||
  (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_APP_VERSION : null) ||
  "1.0.0";

// ─── Token helpers ───────────────────────────────────────────
export const getAccessToken = () => localStorage.getItem("access_token");
export const getRefreshToken = () => localStorage.getItem("refresh_token");
export const saveTokens = (access, refresh) => {
  localStorage.setItem("access_token", access);
  localStorage.setItem("refresh_token", refresh);
};
export const clearTokens = () => {
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
};

// ─── Default headers ─────────────────────────────────────────
export const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${getAccessToken()}`,
});

// ─── Core fetch wrapper (handles 401 → auto-refresh) ─────────
async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;
  const validToken = await getValidAccessToken();
  const headers = {
    "Content-Type": "application/json",
    "X-App-Version": APP_VERSION,
    ...(validToken ? { Authorization: `Bearer ${validToken}` } : {}),
    ...options.headers,
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const getErrorMessage = (errorData, status) => {
    if (!errorData) return `HTTP error! status: ${status}`;
    if (errorData.detail) return errorData.detail;
    if (errorData.message) return errorData.message;
    if (errorData.error) return errorData.error;
    if (typeof errorData === "object" && !Array.isArray(errorData)) {
      const values = Object.values(errorData).flat();
      if (values.length > 0) return values.join(" ");
    }
    return `HTTP error! status: ${status}`;
  };

  // Token expired → try to refresh once
  if (res.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      const retryToken = await getValidAccessToken();
      const retryHeaders = {
        "Content-Type": "application/json",
        "X-App-Version": APP_VERSION,
        ...(retryToken ? { Authorization: `Bearer ${retryToken}` } : {}),
        ...options.headers,
      };
      const retryRes = await fetch(url, {
        ...options,
        headers: retryHeaders,
      });
      if (!retryRes.ok) {
        const errorData = await retryRes.json().catch(() => ({}));
        const err = new Error(getErrorMessage(errorData, retryRes.status));
        err.status = retryRes.status;
        err.data = errorData;
        throw err;
      }
      return retryRes;
    } else {
      clearTokens();
      window.location.href = "/"; // back to login
      return;
    }
  }

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const err = new Error(getErrorMessage(errorData, res.status));
    err.status = res.status;
    err.data = errorData;
    throw err;
  }

  return res;
}

// ─── Token refresh ───────────────────────────────────────────
export async function refreshAccessToken() {
  try {
    const res = await fetch(`${BASE_URL}/token/refresh/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh: getRefreshToken() }),
    });
    if (res.ok) {
      const data = await res.json();
      saveTokens(data.access, data.refresh || getRefreshToken());
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export const getValidAccessToken = async () => {
  const token = getAccessToken();
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return token;

    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(
      decodeURIComponent(
        atob(base64)
          .split('')
          .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
          .join('')
      )
    );

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp - now < 30) {
      const refreshed = await refreshAccessToken();
      if (refreshed) {
        return getAccessToken();
      }
    }
  } catch (err) {
    console.error("Error verifying access token expiration:", err);
  }
  return token;
};


// ============================================================
// AUTH
// ============================================================
export const authAPI = {
  // Step 1: Request OTP
  requestOTP: async (email, device_id = "web-device") => {
    const res = await fetch(`${BASE_URL}/auth/register/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, device_id }),
    });
    return res.json();
  },

  // Step 2: Verify OTP → get tokens
  verifyOTP: async (email, otp, device_id = "web-device") => {
    const res = await fetch(`${BASE_URL}/auth/otp/verify/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, otp, device_id }),
    });
    const data = await res.json();
    if (res.ok && data.access) {
      saveTokens(data.access, data.refresh);
    }
    return { ok: res.ok, data };
  },

  resendOTP: async (email, device_id = "web-device") => {
    const res = await fetch(`${BASE_URL}/auth/otp/resend/`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-App-Version": APP_VERSION },
      body: JSON.stringify({ email, device_id }),
    });
    return res.json();
  },

  // Logout (blacklists refresh token)
  logout: async () => {
    await apiFetch("/auth/logout/", {
      method: "POST",
      body: JSON.stringify({ refresh: getRefreshToken() }),
    });
    clearTokens();
  },

  // Get short-lived WebSocket ticket
  getWsTicket: async () => {
    const res = await apiFetch("/auth/ws-ticket/", { method: "POST" });
    return res.json();
  },
};

// ============================================================
// USER
// ============================================================
export const userAPI = {
  // Get current logged-in user
  getMe: async () => {
    const res = await apiFetch("/users/me/");
    return res.json();
  },

  // Heartbeat + location update
  lastActive: async (lat, lon) => {
    const res = await apiFetch("/users/last-active/", {
      method: "POST",
      body: JSON.stringify({ lat, lon }),
    });
    return res.json();
  },

  // Delete account
  deleteAccount: async () => {
    const res = await apiFetch("/users/delete-account/", { method: "DELETE" });
    return res.status === 204;
  },
};

// ============================================================
// PROFILE
// ============================================================
export const profileAPI = {
  // Get my profile
  getMyProfile: async () => {
    const res = await apiFetch("/profile/me/");
    return res.json();
  },

  // Update my profile (partial update)
  updateMyProfile: async (fields) => {
    const res = await apiFetch("/profile/me/", {
      method: "PATCH",
      body: JSON.stringify(fields),
    });
    return res.json();
  },

  // Get any user's public profile
  getProfile: async (userId) => {
    const res = await apiFetch(`/profile/${userId}/`);
    return res.json();
  },
};

// ============================================================
// SUBSCRIPTION
// ============================================================
export const subscriptionAPI = {
  getStatus: async () => {
    const res = await apiFetch("/subscription/me/");
    return res.json();
  },
  purchase: async (idempotencyKey) => {
    const res = await apiFetch("/subscription/purchase/", {
      method: "POST",
      body: JSON.stringify({ idempotency_key: idempotencyKey }),
    });
    return res.json();
  },
};

// ============================================================
// DISCOVERY THEME
// ============================================================
export const themeAPI = {
  getOptions: async () => {
    const res = await apiFetch("/theme/options/");
    return res.json();
  },
  getMyTheme: async () => {
    const res = await apiFetch("/theme/me/");
    return res.json();
  },
  updateMyTheme: async (payload) => {
    const res = await apiFetch("/theme/me/", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    return res.json();
  },
};

// ============================================================
// PROFILE IMAGES
// ============================================================
export const imageAPI = {
  // Upload profile image (multipart)
  upload: async (file) => {
    const form = new FormData();
    form.append("image", file);
    const validToken = await getValidAccessToken();
    const res = await fetch(`${BASE_URL}/images/upload/`, {
      method: "POST",
      headers: validToken ? { Authorization: `Bearer ${validToken}` } : {}, // no Content-Type — browser sets it with boundary
      body: form,
    });
    return res.json();
  },

  // Reorder images
  reorder: async (imagesArray) => {
    // imagesArray: [{ id: 12, order: 1 }, { id: 13, order: 2 }]
    const res = await apiFetch("/images/reorder/", {
      method: "PATCH",
      body: JSON.stringify({ images: imagesArray }),
    });
    return res.json();
  },

  // Delete image
  delete: async (imageId) => {
    const res = await apiFetch(`/images/${imageId}/`, { method: "DELETE" });
    return res.status === 204;
  },
};

// ============================================================
// FEED (Discovery)
// ============================================================
export const feedAPI = {
  getFeed: async (count = 20, cursor = 0, filters = {}) => {
    const params = new URLSearchParams({ count: String(count), cursor: String(cursor) });
    if (filters.min_age != null) params.set("min_age", String(filters.min_age));
    if (filters.max_age != null) params.set("max_age", String(filters.max_age));
    if (filters.distance != null && filters.distance !== "") {
      params.set("distance", String(filters.distance));
    }
    if (filters.intent) params.set("intent", filters.intent);
    if (filters.city) params.set("city", filters.city);
    if (filters.state) params.set("state", filters.state);
    if (filters.country) params.set("country", filters.country);
    if (filters.currently_online) params.set("currently_online", "true");
    (filters.gender || []).forEach((g) => params.append("gender", String(g)));
    const res = await apiFetch(`/feed/?${params.toString()}`);
    return res.json();
  },
};

// ============================================================
// INTERACTIONS (Swipe)
// ============================================================
export const interactionAPI = {
  // Like (swipe right)
  like: async (targetUserId) => {
    const res = await apiFetch("/interaction/send/", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    return res.json();
  },

  // Pass (swipe left)
  pass: async (targetUserId) => {
    const res = await apiFetch("/interaction/pass/", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId }),
    });
    return res.json();
  },

  // Get count of people who liked me
  getReceivedLikes: async () => {
    const res = await apiFetch("/interaction/received/");
    return res.json();
    // returns { count: 3, users: [] }
  },

  // Direct Conversation Request (Females only)
  startConversation: async (targetUserId, message) => {
    const res = await apiFetch("/interaction/start_conversation/", {
      method: "POST",
      body: JSON.stringify({ target_user_id: targetUserId, message }),
    });
    return res.json();
  },

  // Accept Conversation Request
  acceptRequest: async (senderId) => {
    const res = await apiFetch("/interaction/accept_request/", {
      method: "POST",
      body: JSON.stringify({ sender_id: senderId }),
    });
    return res.json();
  },
};

// ============================================================
// MATCHES
// ============================================================
export const matchAPI = {
  // Get all matches
  getMatches: async () => {
    const res = await apiFetch("/matches/");
    return res.json();
  },

  // Get single match
  getMatch: async (matchId) => {
    const res = await apiFetch(`/matches/${matchId}/`);
    return res.json();
  },
};

// ============================================================
// CONVERSATIONS & MESSAGES (Chat REST)
// ============================================================
export const chatAPI = {
  // Get all conversations
  getConversations: async () => {
    const res = await apiFetch("/conversations/");
    return res.json();
  },

  // Get single conversation
  getConversation: async (id) => {
    const res = await apiFetch(`/conversations/${id}/`);
    return res.json();
  },

  // Get messages in a conversation (newest first)
  getMessages: async (conversationId) => {
    const res = await apiFetch(`/messages/?conversation_id=${conversationId}`);
    return res.json();
  },

  // Send a message (REST alternative to WebSocket)
  sendMessage: async (conversationId, text) => {
    const res = await apiFetch("/messages/", {
      method: "POST",
      body: JSON.stringify({
        conversation: conversationId,
        content: { text },
        message_type: "text",
      }),
    });
    return res.json();
  },

  // Mark message as seen
  markSeen: async (messageId) => {
    const res = await apiFetch(`/messages/${messageId}/seen/`, {
      method: "POST",
    });
    return res.json();
  },

  // Upload chat media
  uploadMedia: async (conversationId, file, type = "image") => {
    const form = new FormData();
    form.append("media", file);
    form.append("message_type", type);
    const validToken = await getValidAccessToken();
    const res = await fetch(
      `${BASE_URL}/conversations/${conversationId}/upload_media/`,
      {
        method: "POST",
        headers: validToken ? { Authorization: `Bearer ${validToken}` } : {},
        body: form,
      },
    );
    return res.json();
  },

  // Get conversation message draft
  getDraft: async (conversationId) => {
    const res = await apiFetch(`/conversations/${conversationId}/draft/`);
    return res.json();
  },

  // Save conversation message draft
  saveDraft: async (conversationId, content) => {
    const res = await apiFetch(`/conversations/${conversationId}/draft/`, {
      method: "POST",
      body: JSON.stringify({ content }),
    });
    return res.json();
  },

  // React to message (Add/Toggle)
  reactMessage: async (messageId, emoji) => {
    const res = await apiFetch(`/messages/${messageId}/react/`, {
      method: "POST",
      body: JSON.stringify({ emoji }),
    });
    return res.json();
  },

  // Report message
  reportMessage: async (messageId, reason, description) => {
    const res = await apiFetch(`/messages/${messageId}/report/`, {
      method: "POST",
      body: JSON.stringify({ reason, description }),
    });
    return res.json();
  },

  deleteConversation: async (id) => {
    const res = await apiFetch(`/conversations/${id}/`, {
      method: "DELETE",
    });
    return res.json();
  },

  leaveConversation: async (id) => {
    const res = await apiFetch(`/conversations/${id}/leave/`, {
      method: "POST",
    });
    return res.json();
  },
};

// ============================================================
// MOOD
// ============================================================
export const moodAPI = {
  // Get my moods
  getMyMoods: async () => {
    const res = await apiFetch("/mood/");
    return res.json();
  },

  // Set moods (up to 3 IDs)
  setMoods: async (moodIds) => {
    const res = await apiFetch("/mood/", {
      method: "POST",
      body: JSON.stringify({ mood_ids: moodIds }),
    });
    return res.json();
  },

  // Get mood options (for dropdown)
  getMoodOptions: async () => {
    const res = await apiFetch("/mood_options/");
    return res.json();
  },
};

// ============================================================
// MASTER OPTIONS
// ============================================================
export const optionsAPI = {
  getIntents: async () => {
    const r = await apiFetch("/intents/");
    return r.json();
  },
  getTurnOns: async () => {
    const r = await apiFetch("/turn_ons/");
    return r.json();
  },
  getLanguages: async () => {
    const r = await apiFetch("/languages/");
    return r.json();
  },
  getMoodOpts: async () => {
    const r = await apiFetch("/mood_options/");
    return r.json();
  },
  getGenders: async () => {
    const r = await apiFetch("/genders/");
    return r.json();
  },
  getSexualities: async () => {
    const r = await apiFetch("/sexualities/");
    return r.json();
  },
};

// ============================================================
// SOCIAL (Confessions)
// ============================================================
export const socialAPI = {
  getMoodTags: async () => {
    const res = await apiFetch("/social/moods/");
    return res.json();
  },

  // Post a confession
  post: async ({ text, mood_tag, language = "en", latitude, longitude }) => {
    const res = await apiFetch("/social/", {
      method: "POST",
      body: JSON.stringify({ text, mood_tag, language, latitude, longitude }),
    });
    return res.json();
  },

  // Nearby feed
  getFeed: async (lat, lon) => {
    const res = await apiFetch(`/social/feed/?lat=${lat}&lon=${lon}`);
    return res.json();
  },

  relate: async (id) => {
    const r = await apiFetch(`/social/${id}/relate/`, { method: "POST" });
    return r.json();
  },
  repost: async (id, thought) => {
    const r = await apiFetch(`/social/${id}/repost/`, {
      method: "POST",
      body: JSON.stringify({ type: "REPOST", repost_thought: thought }),
    });
    return r.json();
  },
  report: async (id) => {
    const r = await apiFetch(`/social/${id}/report/`, { method: "POST" });
    return r.json();
  },

  getWhispers: async (id) => {
    const r = await apiFetch(`/social/${id}/whispers/`);
    return r.json();
  },
  addWhisper: async (id, text, is_anonymous = true) => {
    const r = await apiFetch(`/social/${id}/whispers/`, {
      method: "POST",
      body: JSON.stringify({ text, is_anonymous }),
    });
    return r.json();
  },

  chatRequest: async (id, message) => {
    const r = await apiFetch(`/social/${id}/chat-request/`, {
      method: "POST",
      body: JSON.stringify({ message }),
    });
    return r.json();
  },
};

// ============================================================
// VERIFICATION
// ============================================================
export const verificationAPI = {
  getChallenge: async () => {
    const res = await apiFetch("/verification/challenge/", { method: "POST" });
    return res.json();
  },

  upload: async (poseType, file) => {
    const form = new FormData();
    form.append("pose_type", poseType);
    form.append("image", file);
    const validToken = await getValidAccessToken();
    const res = await fetch(`${BASE_URL}/verification/upload/`, {
      method: "POST",
      headers: validToken ? { Authorization: `Bearer ${validToken}` } : {},
      body: form,
    });
    return res.json();
  },

  getStatus: async () => {
    const res = await apiFetch("/verification/status/");
    return res.json();
  },

  // Complete FaceIO Verification
  completeFaceIO: async (facialId) => {
    const res = await apiFetch("/verification/faceio-complete/", {
      method: "POST",
      body: JSON.stringify({ facial_id: facialId }),
    });
    return res.json();
  },
};

// ============================================================
// CALLS (WebRTC calling)
// ============================================================
export const callAPI = {
  getIceServers: async (forceTurn = false, stunOnly = false) => {
    const res = await apiFetch(`/call/ice-servers/?force_turn=${forceTurn}&stun_only=${stunOnly}`);
    return res.json();
  },
  submitMetrics: async (metricsData) => {
    const res = await apiFetch("/call/metrics/", {
      method: "POST",
      body: JSON.stringify(metricsData),
    });
    return res.json();
  },
  getQuota: async () => {
    const res = await apiFetch("/call/quota/");
    return res.json();
  },
  addMinutes: async (minutes) => {
    const res = await apiFetch("/call/add-minutes/", {
      method: "POST",
      body: JSON.stringify({ minutes }),
    });
    return res.json();
  },
};


// ============================================================
// GEOLOCATION
// ============================================================
export const geoAPI = {
  reverseGeocode: async (lat, lng) => {
    const res = await apiFetch(`/geo/reverse/?lat=${lat}&lng=${lng}`);
    return res.json();
  },
  autocompleteCity: async (query) => {
    const res = await apiFetch(`/geo/autocomplete/?q=${encodeURIComponent(query)}`);
    return res.json();
  },
};

// ============================================================
// MODERATION (Reporting)
// ============================================================
export const moderationAPI = {
  submitReport: async ({ reportedUserId, reason, description, targetType, targetId, messageId, postId, confessionId }) => {
    const body = { reported_user_id: reportedUserId, reason, description };
    if (targetType) body.target_type = targetType;
    if (targetId) body.target_id = targetId;
    if (messageId) body.message_id = messageId;
    if (postId) body.post_id = postId;
    if (confessionId) body.confession_id = confessionId;

    const res = await apiFetch("/moderation/moderation/report/", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return res.json();
  },
};

// ============================================================
// CONFESSION REQUESTS
// ============================================================
export const confessionRequestAPI = {
  listRequests: async () => {
    const res = await apiFetch("/confession-requests/");
    return res.json();
  },
  acceptRequest: async (id) => {
    const res = await apiFetch(`/confession-requests/${id}/accept/`, {
      method: "POST",
    });
    return res.json();
  },
  rejectRequest: async (id) => {
    const res = await apiFetch(`/confession-requests/${id}/reject/`, {
      method: "POST",
    });
    return res.json();
  },
};

// ============================================================
// WEBSOCKET helpers
// ============================================================
export const WS_BASE = 
  (typeof process !== "undefined" && process.env ? process.env.REACT_APP_WS_URL : null) ||
  (typeof import.meta !== "undefined" && import.meta.env ? import.meta.env.VITE_WS_URL : null) ||
  "wss://testapi.spycenow.com/ws";

export const wsURL = {
  chat: (conversationId, ticket) =>
    `${WS_BASE}/chat/${conversationId}/?ticket=${ticket}`,
  call: (ticket) => `${WS_BASE}/call/?ticket=${ticket}`,
  blindDate: (ticket) => `${WS_BASE}/blind-date/?ticket=${ticket}`,
  notifications: (ticket) => `${WS_BASE}/notifications/?ticket=${ticket}`,
};
