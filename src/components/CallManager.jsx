import React, { useState, useEffect, useRef } from "react";
import { callAPI, wsURL, authAPI } from "../api";
import callCss from "../styles/CallManager.module.css";

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Centralized structured logger
// logWebRTC(stage, data) is the canonical API required by the spec.
// Emits: [WEBRTC][<STAGE>] { timestamp, ...data }
// Legacy log.* aliases preserved so all existing call sites compile unchanged.
// ─────────────────────────────────────────────────────────────────────────────
function logWebRTC(stage, data = {}) {
  console.log(`[WEBRTC][${stage}]`, {
    timestamp: new Date().toISOString(),
    ...data,
  });
}

const log = {
  webrtc: (...a) => logWebRTC("WEBRTC", { detail: a }),
  ice: (...a) => logWebRTC("ICE", { detail: a }),
  signaling: (...a) => logWebRTC("SIGNALING", { detail: a }),
  turn: (...a) => logWebRTC("TURN", { detail: a }),
  restart: (...a) => logWebRTC("RESTART", { detail: a }),
  stats: (...a) => logWebRTC("STATS", { detail: a }),
  warn: (...a) => { console.warn(`[WEBRTC][WARN]`, { timestamp: new Date().toISOString(), detail: a }); },
  error: (...a) => { console.error(`[WEBRTC][ERROR]`, { timestamp: new Date().toISOString(), detail: a }); },
};

// Connection strategy:
//   "hybrid"    — STUN + TURN in initial PC config, iceTransportPolicy "all" (P2P preferred).
//                 ICE tries host/srflx/IPv6 first; relay only when hole-punch fails (~80–95% connect).
//   "p2p_only"  — STUN only (testing / same-network). Fails on symmetric NAT / double CGNAT (Jio↔Airtel).
const CONNECTION_MODE = "hybrid";
const P2P_ONLY_MODE = CONNECTION_MODE === "p2p_only";
const ICE_CANDIDATE_POOL_SIZE = 30;
const CANDIDATE_CACHE_TTL_MS = 45000;

// Phase 1 — Initial ICE stabilization (adaptive timeout from backend prediction)
const DISCONNECT_GRACE_MS = 12000;
const INITIAL_DISCONNECT_GRACE_MS = 20000;
const INITIAL_ICE_TIMEOUT_MS = 60000;
const ICE_RESTART_COOLDOWN = 8000;
const MAX_RECOVERY_CYCLES = 2;
const ALLOWED_OFFER_REASONS = P2P_ONLY_MODE
  ? new Set(["initial"])
  : new Set(["initial", "ice_restart_recovery"]);

const DEFAULT_STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];

// Canonical per-call lifecycle steps (logged in order with seq + callId)
const CALL_LIFECYCLE = {
  PC_CREATED: "PeerConnection Created",
  CREATE_OFFER: "createOffer()",
  SET_LOCAL_DESCRIPTION_OFFER: "setLocalDescription() [offer]",
  OFFER_SENT: "Offer Sent",
  OFFER_RECEIVED: "Offer Received",
  SET_REMOTE_DESCRIPTION_OFFER: "setRemoteDescription() [offer]",
  CREATE_ANSWER: "createAnswer()",
  SET_LOCAL_DESCRIPTION_ANSWER: "setLocalDescription() [answer]",
  ANSWER_SENT: "Answer Sent",
  ANSWER_RECEIVED: "Answer Received",
  SET_REMOTE_DESCRIPTION_ANSWER: "setRemoteDescription() [answer]",
  ICE_GATHERING_STARTED: "ICE Gathering Started",
  LOCAL_CANDIDATE_GENERATED: "Local Candidate Generated",
  LOCAL_CANDIDATE_SENT: "Local Candidate Sent",
  REMOTE_CANDIDATE_RECEIVED: "Remote Candidate Received",
  ADD_ICE_CANDIDATE: "addIceCandidate()",
  ICE_STATE_CHANGED: "ICE State Changed",
  CONNECTION_STATE_CHANGED: "Connection State Changed",
  SELECTED_CANDIDATE_PAIR: "Selected Candidate Pair",
  SIGNALING_STATE_CHANGED: "Signaling State Changed",
  OFFER_IGNORED: "Offer Ignored",
  REMOTE_CANDIDATE_END: "Remote Candidate End",
  AUDIT: "Audit",
};

export default function CallManager({ user, debug }) {
  const [callState, setCallState] = useState("idle"); // idle, ringing, incoming, active
  const [callType, setCallType] = useState("voice");
  const [callerEmail, setCallerEmail] = useState("");
  const [callId, setCallId] = useState("");

  const callStateRef = useRef("idle");
  const callIdRef = useRef("");
  const callTypeRef = useRef("voice");

  useEffect(() => { callStateRef.current = callState; }, [callState]);
  useEffect(() => { callIdRef.current = callId; }, [callId]);
  useEffect(() => { callTypeRef.current = callType; }, [callType]);
  useEffect(() => { installTimelineGlobals(); }, []);
  useEffect(() => { runNetworkProbe(); }, []);

  // Active call UI state
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraActive, setCameraActive] = useState(true);
  const [chatSaved, setChatSaved] = useState(false);
  const [cameraUnlocked, setCameraUnlocked] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isMediaConnected, setIsMediaConnected] = useState(false);
  const [quotaWarning, setQuotaWarning] = useState(null);
  const [isAddingMinutes, setIsAddingMinutes] = useState(false);
  const mediaConnectedSentRef = useRef(false);

  // Media refs
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const remoteAudioRef = useRef(null);

  // WebRTC & socket refs
  const socketRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const timerRef = useRef(null);
  const isInitiatorRef = useRef(false);
  const signalingQueueRef = useRef([]);
  const isProcessingQueueRef = useRef(false);
  const remoteDescriptionAppliedRef = useRef(false);
  const isNegotiatingRef = useRef(false);
  const negotiationQueuedRef = useRef(false);
  const negotiationChainRef = useRef(Promise.resolve());
  const webrtcSetupRunningRef = useRef(false); // guard: prevent double-invoke of setupWebRTCPeer
  const webrtcSetupGenerationRef = useRef(0); // invalidates stale async setupWebRTCPeer runs
  const webrtcPeerReadyRef = useRef(false);
  const rtcStateRef = useRef("IDLE");
  const initialNegotiationStartedRef = useRef(false);
  const initialNegotiationCompleteRef = useRef(false);
  const iceRestartInFlightRef = useRef(false);
  const initialIcePhaseExpiredRef = useRef(false);
  const appliedRemoteSdpKeysRef = useRef(new Set());
  const transceiversRef = useRef({ audio: null, video: null });
  const dataChannelRef = useRef(null);

  // ICE candidate tracking
  const pendingIceCandidates = useRef([]);
  const processedRemoteCandidatesRef = useRef(new Set());
  const outgoingQueueRef = useRef([]);

  // Phase 5 — ICE restart state
  const lastIceRestartTimeRef = useRef(0);
  const recoveryAttemptsRef = useRef(0);
  const isRecoveringRef = useRef(false);
  const disconnectTimerRef = useRef(null); // 6s grace timer for "disconnected"

  // Phase 6 — TURN escalation state
  const initialIceTimeoutRef = useRef(null); // 60s: first-connect patience window
  const failureDiagnosisTimeoutRef = useRef(null); // Phase 9 failure engine
  const turnEscalatedRef = useRef(false);
  const turnFallbackOccurredRef = useRef(false);

  // P2P Network Intelligence Stack
  const adaptiveIceTimeoutMsRef = useRef(INITIAL_ICE_TIMEOUT_MS);
  const iceCandidatePoolSizeRef = useRef(ICE_CANDIDATE_POOL_SIZE);
  const connectionPredictionRef = useRef(null);
  const preferIpv6Ref = useRef(false);
  const localIpv6AvailableRef = useRef(false);
  const calleeIdRef = useRef("");
  const lastReportedIceStateRef = useRef("");
  const networkProbeRunningRef = useRef(false);
  const maxRecoveryCyclesRef = useRef(MAX_RECOVERY_CYCLES);
  const coordinatedRestartApprovedRef = useRef(false);

  // Phase 4 — Telemetry timestamps
  const callStartTimeRef = useRef(0);
  const offerCreatedTimeRef = useRef(0);
  const answerReceivedTimeRef = useRef(0);
  const iceConnectedTimeRef = useRef(0);
  const firstMediaReceivedTimeRef = useRef(0);
  const iceGatheringStartTimeRef = useRef(0);
  const iceGatheringEndTimeRef = useRef(0);
  const connectionStartTimeRef = useRef(0);
  const connectionEndTimeRef = useRef(0);

  // Phase 7 — Candidate analytics
  const candidateCountsRef = useRef({ host: 0, srflx: 0, relay: 0 });
  const localCandidateFamiliesRef = useRef({ ipv4: 0, ipv6: 0 });
  const remoteCandidateFamiliesRef = useRef({ ipv4: 0, ipv6: 0 });
  const localCandidateTypesRef = useRef({});
  const remoteCandidateTypesRef = useRef({});
  const selectedCandidatePairRef = useRef(null);
  const candidatePairAnalyticsRef = useRef(null);

  // Phase 7 — Connection quality telemetry
  const rttHistoryRef = useRef([]);
  const rttAverageRef = useRef(0);
  const maxRttRef = useRef(0);
  const lossAverageRef = useRef(0);
  const maxPacketLossRef = useRef(0);
  const jitterAverageRef = useRef(0);
  const bitrateHistoryRef = useRef([]);
  const lastStatsRef = useRef(null);
  const currentBitrateRef = useRef(800 * 1000);
  const metricsSubmittedRef = useRef(false);

  // Stats polling
  const statsIntervalRef = useRef(null);

  // Debug panel state
  const [debugIceState, setDebugIceState] = useState("new");
  const [debugConnectionState, setDebugConnectionState] = useState("new");
  const [remoteTrackStatus, setRemoteTrackStatus] = useState("Awaiting tracks...");
  const [callErrorMessage, setCallErrorMessage] = useState(null);

  const [debugMediaStatus, setDebugMediaStatus] = useState("Waiting...");
  const [debugCurrentStep, setDebugCurrentStep] = useState("IDLE");

  // Ringtone
  const ringtoneRef = useRef(null);

  // Keep handlers fresh across closures
  const handleSocketMessageRef = useRef(null);
  const cleanupCallRef = useRef(null);

  // Per-call lifecycle timeline — window.dumpCallTimeline() / window.getCallTimeline(callId)
  const pcInstanceIdRef = useRef(0);
  const timelineSeqRef = useRef(0);
  const lastSignalingStateRef = useRef("new");
  const lastIceStateRef = useRef("new");
  const lastConnectionStateRef = useRef("new");
  const callTimelineRef = useRef({
    callId: null,
    startedAt: null,
    role: null,
    events: [],
    counters: {
      pcCreated: 0,
      offersCreated: 0,
      offersSent: 0,
      offersReceived: 0,
      offersIgnored: 0,
      answersCreated: 0,
      answersSent: 0,
      answersReceived: 0,
      localCandidatesGenerated: 0,
      localCandidatesSent: 0,
      remoteCandidatesReceived: 0,
      remoteCandidatesApplied: 0,
      remoteCandidatesQueued: 0,
      remoteCandidatesFailed: 0,
      setConfigurationCalls: 0,
      restartIceCalls: 0,
    },
  });

  const getTimelineContext = () => ({
    callId: callIdRef.current,
    role: isInitiatorRef.current ? "caller" : "callee",
    pcInstance: pcInstanceIdRef.current,
    iceState: pcRef.current?.iceConnectionState ?? lastIceStateRef.current,
    signalingState: pcRef.current?.signalingState ?? lastSignalingStateRef.current,
    connectionState: pcRef.current?.connectionState ?? lastConnectionStateRef.current,
    initialIcePhase: isInitialIcePhase(),
    elapsedMs: callStartTimeRef.current ? Date.now() - callStartTimeRef.current : 0,
  });

  const persistTimelineGlobally = () => {
    if (typeof window === "undefined" || !callTimelineRef.current.callId) return;
    if (!window.__callTimelines) window.__callTimelines = {};
    window.__callTimelines[callTimelineRef.current.callId] = {
      callId: callTimelineRef.current.callId,
      role: callTimelineRef.current.role,
      startedAt: callTimelineRef.current.startedAt,
      counters: { ...callTimelineRef.current.counters },
      events: [...callTimelineRef.current.events],
    };
  };

  const formatTimelineDump = (timeline) => {
    const lines = timeline.events.map((e) => {
      const ts = e.elapsedMs != null ? `+${e.elapsedMs}ms` : "";
      const states = `[ice:${e.iceState} sig:${e.signalingState} conn:${e.connectionState}]`;
      const extra = e.from != null && e.to != null ? ` ${e.from} → ${e.to}` : "";
      const detail = e.type ? ` (${e.type}/${e.family || "?"})` : "";
      return `${String(e.seq).padStart(3, " ")}. ${ts.padStart(8)} ${e.step}${extra}${detail} ${states}`;
    });
    return [
      `── Call Timeline: ${timeline.callId} (${timeline.role}) ──`,
      ...lines,
      "── Counters ──",
      JSON.stringify(timeline.counters, null, 2),
    ].join("\n");
  };

  const buildTimelineDump = (callId = callIdRef.current) => {
    const stored = typeof window !== "undefined" && window.__callTimelines?.[callId];
    const timeline = stored || {
      callId: callTimelineRef.current.callId,
      role: callTimelineRef.current.role,
      startedAt: callTimelineRef.current.startedAt,
      counters: { ...callTimelineRef.current.counters },
      events: [...callTimelineRef.current.events],
    };
    const mismatch = {
      localGeneratedVsSent:
        timeline.counters.localCandidatesGenerated - timeline.counters.localCandidatesSent,
      remoteReceivedVsApplied:
        timeline.counters.remoteCandidatesReceived - timeline.counters.remoteCandidatesApplied,
      extraOffersAfterFirst:
        Math.max(0, timeline.counters.offersReceived - 1),
      multiplePCs: timeline.counters.pcCreated > 1,
    };
    return { ...timeline, mismatch, formatted: formatTimelineDump(timeline) };
  };

  const timelineBump = (counter, extra = {}) => {
    const c = callTimelineRef.current.counters;
    c[counter] = (c[counter] || 0) + 1;
    persistTimelineGlobally();
    logWebRTC("TIMELINE_COUNTER", { counter, count: c[counter], ...getTimelineContext(), ...extra });
  };

  const timelineLog = (stepKey, extra = {}) => {
    timelineSeqRef.current += 1;
    const step = CALL_LIFECYCLE[stepKey] || stepKey;
    const entry = {
      seq: timelineSeqRef.current,
      step: step,
      stepKey,
      ...getTimelineContext(),
      ...extra,
    };
    callTimelineRef.current.events.push({ t: Date.now(), ...entry });
    persistTimelineGlobally();
    logWebRTC("CALL_TIMELINE", entry);

    if (stepKey === "PC_CREATED" && callTimelineRef.current.counters.pcCreated > 1) {
      log.warn("Multiple PeerConnections for same callId — expect extra Offers.", {
        pcCreated: callTimelineRef.current.counters.pcCreated,
        callId: callIdRef.current,
      });
    }
  };

  const auditAction = (action, reason, extra = {}) => {
    logWebRTC("AUDIT", {
      action,
      reason,
      why: reason,
      ...getTimelineContext(),
      ...extra,
    });
    timelineLog("AUDIT", { action, reason, ...extra });
  };

  const resetCallTimeline = (callId) => {
    timelineSeqRef.current = 0;
    callTimelineRef.current = {
      callId,
      startedAt: Date.now(),
      role: isInitiatorRef.current ? "caller" : "callee",
      events: [],
      counters: {
        pcCreated: 0,
        offersCreated: 0,
        offersSent: 0,
        offersReceived: 0,
        offersIgnored: 0,
        answersCreated: 0,
        answersSent: 0,
        answersReceived: 0,
        localCandidatesGenerated: 0,
        localCandidatesSent: 0,
        remoteCandidatesReceived: 0,
        remoteCandidatesApplied: 0,
        remoteCandidatesQueued: 0,
        remoteCandidatesFailed: 0,
        setConfigurationCalls: 0,
        restartIceCalls: 0,
      },
    };
    lastSignalingStateRef.current = "new";
    lastIceStateRef.current = "new";
    lastConnectionStateRef.current = "new";
    persistTimelineGlobally();
  };

  const installTimelineGlobals = () => {
    if (typeof window === "undefined") return;
    window.__callTimelines = window.__callTimelines || {};
    window.dumpCallTimeline = (callId) => {
      const dump = buildTimelineDump(callId);
      console.log(dump.formatted);
      console.table(dump.counters);
      if (dump.mismatch.multiplePCs || dump.mismatch.extraOffersAfterFirst > 0) {
        console.warn("[WEBRTC] Timeline health issues:", dump.mismatch);
      }
      return dump;
    };
    window.getCallTimeline = (callId) => (
      window.__callTimelines?.[callId] || buildTimelineDump(callId)
    );
    window.listCallTimelines = () => Object.keys(window.__callTimelines || {});
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Helpers
  // ───────────────────────────────────────────────────────────────────────────
  const parseCandidateType = (candidateStr) => {
    if (!candidateStr) return null;
    const m = candidateStr.match(/typ\s+(\w+)/i);
    return m ? m[1].toLowerCase() : null;
  };

  const isIpv6Address = (address) => {
    if (!address || typeof address !== "string") return false;
    const normalized = address.split("%")[0];
    return normalized.includes(":") && !/^\d+\.\d+\.\d+\.\d+$/.test(normalized);
  };

  const parseCandidateAddressFamily = (candidateStr) => {
    if (!candidateStr) return "unknown";
    const m = candidateStr.match(/candidate:\S+\s+\d+\s+\w+\s+\d+\s+([^\s]+)/);
    if (!m) return "unknown";
    return isIpv6Address(m[1]) ? "ipv6" : "ipv4";
  };

  const trackCandidateTelemetry = (candidateStr, direction) => {
    const type = parseCandidateType(candidateStr);
    const family = parseCandidateAddressFamily(candidateStr);
    if (type) {
      const typesRef = direction === "local" ? localCandidateTypesRef : remoteCandidateTypesRef;
      typesRef.current[type] = (typesRef.current[type] || 0) + 1;
      if (direction === "local") {
        candidateCountsRef.current[type] = (candidateCountsRef.current[type] || 0) + 1;
      }
    }
    if (family === "ipv4" || family === "ipv6") {
      const familiesRef = direction === "local" ? localCandidateFamiliesRef : remoteCandidateFamiliesRef;
      familiesRef.current[family] = (familiesRef.current[family] || 0) + 1;
    }
    return { type, family };
  };

  const dedupeIceServers = (servers) => {
    const seen = new Set();
    return servers.filter((server) => {
      let urlsArray = Array.isArray(server.urls) ? server.urls : [server.urls].filter(Boolean);
      
      // Do not include IPv6 STUN servers if IPv6 isn't available
      if (!localIpv6AvailableRef.current) {
        urlsArray = urlsArray.filter(u => typeof u === "string" && !u.includes("2001:4860"));
      }
      
      if (urlsArray.length === 0) return false;
      const urls = urlsArray.join("|");
      const key = `${urls}|${server.username || ""}`;
      if (seen.has(key)) return false;
      seen.add(key);
      server.urls = urlsArray.length === 1 ? urlsArray[0] : urlsArray;
      return true;
    });
  };

  const mapIceServersFromApi = (iceServers) => (
    (iceServers || []).map((server) => {
      const mapped = { urls: server.urls };
      if (server.username) mapped.username = server.username;
      if (server.credential) mapped.credential = server.credential;
      return mapped;
    })
  );

  const filterStunOnlyIceServers = (servers) => (
    (servers || []).flatMap((server) => {
      const urls = Array.isArray(server.urls) ? server.urls : [server.urls];
      const stunUrls = urls.filter(
        (u) => typeof u === "string" && (u.startsWith("stun:") || u.startsWith("stuns:")),
      );
      if (!stunUrls.length) return [];
      return [{ urls: stunUrls.length === 1 ? stunUrls[0] : stunUrls }];
    })
  );

  const serializeIceCandidate = (candidate) => {
    if (!candidate) return null;
    return {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      usernameFragment: candidate.usernameFragment,
    };
  };

  const closePeerConnection = (reason = "unspecified") => {
    const pc = pcRef.current;
    if (pc) {
      auditAction("PC_CLOSED", reason);
      pc.oniceconnectionstatechange = null;
      pc.onconnectionstatechange = null;
      pc.onicegatheringstatechange = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onsignalingstatechange = null;
      pc.onnegotiationneeded = null;
      pc.ondatachannel = null;
      try { pc.close(); } catch { /* already closed */ }
      pcRef.current = null;
    }
    if (typeof window !== "undefined" && window.pc) {
      window.pc = null;
    }
    webrtcPeerReadyRef.current = false;
  };

  const buildRtcConfiguration = (iceServers) => {
    const servers = P2P_ONLY_MODE
      ? dedupeIceServers(filterStunOnlyIceServers(iceServers))
      : dedupeIceServers(iceServers);
    return {
      iceServers: servers,
      iceTransportPolicy: "all",
      iceCandidatePoolSize: iceCandidatePoolSizeRef.current,
      bundlePolicy: "max-bundle",
      rtcpMuxPolicy: "require",
      continualGatheringPolicy: "gather_continually",
    };
  };

  const detectClientEnvironment = () => {
    const ua = navigator.userAgent || "";
    let browser = "unknown";
    if (ua.includes("Chrome")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari")) browser = "Safari";
    let os = "unknown";
    if (/Android/i.test(ua)) os = "Android";
    else if (/iPhone|iPad/i.test(ua)) os = "iOS";
    else if (/Windows/i.test(ua)) os = "Windows";
    else if (/Mac/i.test(ua)) os = "macOS";
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return {
      browser,
      os,
      connectionType: conn?.type || conn?.effectiveType || "",
    };
  };

  const runNetworkProbe = async () => {
    if (networkProbeRunningRef.current) return;
    networkProbeRunningRef.current = true;
    try {
      const iceRes = await callAPI.getIceServers(false, true);
      const stunServers = (iceRes?.iceServers || DEFAULT_STUN_SERVERS).slice(0, 6);
      const probePc = new RTCPeerConnection({
        iceServers: stunServers,
        iceCandidatePoolSize: 4,
      });
      const counts = { host: 0, srflx: 0, relay: 0 };
      let ipv6HostCandidates = 0;
      let hasIpv6 = false;
      const gatherStart = Date.now();
      probePc.onicecandidate = (event) => {
        if (!event.candidate?.candidate) return;
        const c = event.candidate.candidate;
        const addr = c.split(" ")[4] || "";
        const family = isIpv6Address(addr) ? "ipv6" : "ipv4";
        if (c.includes("typ host")) {
          counts.host += 1;
          if (family === "ipv6") ipv6HostCandidates += 1;
        }
        if (c.includes("typ srflx")) counts.srflx += 1;
        if (c.includes("typ relay")) counts.relay += 1;
        if (family === "ipv6") hasIpv6 = true;
      };
      probePc.createDataChannel("network_probe");
      const offer = await probePc.createOffer();
      await probePc.setLocalDescription(offer);
      await new Promise((resolve) => setTimeout(resolve, 2800));
      probePc.close();
      const env = detectClientEnvironment();
      const profile = {
        ipv4: counts.host > 0 || counts.srflx > 0,
        ipv6: hasIpv6,
        has_ipv6: hasIpv6,
        ipv6_host_candidates: ipv6HostCandidates,
        host_candidates: counts.host,
        srflx_candidates: counts.srflx,
        relay_candidates: counts.relay,
        gathering_time: (Date.now() - gatherStart) / 1000,
        stun_server: iceRes?.region || "regional",
        browser: env.browser,
        os: env.os,
        transport: "UDP",
        connection_type: env.connectionType,
      };
      localIpv6AvailableRef.current = hasIpv6;
      const result = await callAPI.submitNetworkProfile(profile);
      logWebRTC("NETWORK_PROFILE_UPLOADED", {
        ...profile,
        nat: result?.likely_nat_type,
        ipv6_available: result?.ipv6_available,
      });
    } catch (err) {
      log.warn("Network probe failed:", err);
    } finally {
      networkProbeRunningRef.current = false;
    }
  };

  const loadCallIntelligence = async (peerId) => {
    if (!peerId) return;
    try {
      const prediction = await callAPI.getConnectionPrediction(peerId);
      connectionPredictionRef.current = prediction;
      const adaptive = prediction?.adaptive_ice;
      preferIpv6Ref.current = Boolean(
        prediction?.prefer_ipv6 || adaptive?.prefer_ipv6,
      );
      if (adaptive) {
        adaptiveIceTimeoutMsRef.current = adaptive.initial_ice_timeout_ms || INITIAL_ICE_TIMEOUT_MS;
        iceCandidatePoolSizeRef.current = adaptive.ice_candidate_pool_size || ICE_CANDIDATE_POOL_SIZE;
        maxRecoveryCyclesRef.current = adaptive.max_recovery_cycles || MAX_RECOVERY_CYCLES;
      }
      logWebRTC("CONNECTION_PREDICTION", {
        p2p_probability: prediction?.p2p_success_probability,
        turn_recommended: prediction?.turn_recommended,
        expected_ice_seconds: prediction?.expected_ice_seconds,
        prefer_ipv6: preferIpv6Ref.current,
        caller_has_ipv6: prediction?.caller_has_ipv6,
        callee_has_ipv6: prediction?.callee_has_ipv6,
        likely_transport: prediction?.likely_transport,
        adaptive,
      });
    } catch (err) {
      log.warn("Connection prediction unavailable:", err);
    }
  };

  const reportIceState = (state, prev, elapsedMs) => {
    if (!callIdRef.current || state === lastReportedIceStateRef.current) return;
    lastReportedIceStateRef.current = state;
    sendSignaling({
      action: "ice_state",
      call_id: callIdRef.current,
      state,
      previous_state: prev || "",
      elapsed_ms: elapsedMs,
    });
    callAPI.submitIceState({
      call_session_id: callIdRef.current,
      state,
      previous_state: prev || "",
      elapsed_ms: elapsedMs,
      metadata: { mode: CONNECTION_MODE },
    }).catch(() => { });
  };

  const getCachedCandidates = () => {
    try {
      const raw = sessionStorage.getItem("spyce_ice_candidate_cache");
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > CANDIDATE_CACHE_TTL_MS) return null;
      return parsed;
    } catch {
      return null;
    }
  };

  const saveCandidateCache = () => {
    try {
      sessionStorage.setItem("spyce_ice_candidate_cache", JSON.stringify({
        timestamp: Date.now(),
        localTypes: { ...localCandidateTypesRef.current },
        families: { ...localCandidateFamiliesRef.current },
        counts: { ...candidateCountsRef.current },
      }));
    } catch { /* quota */ }
  };

  const extractIceUfrag = (sdp) => {
    const match = (sdp || "").match(/a=ice-ufrag:(\S+)/);
    return match ? match[1] : null;
  };

  const isIceRestartSdp = (sdp, pc) => {
    if (!pc?.remoteDescription?.sdp) return false;
    const nextUfrag = extractIceUfrag(sdp);
    const currentUfrag = extractIceUfrag(pc.remoteDescription.sdp);
    return !!(nextUfrag && currentUfrag && nextUfrag !== currentUfrag);
  };

  const isInitialIcePhase = () => {
    if (iceConnectedTimeRef.current > 0) return false;
    if (initialIcePhaseExpiredRef.current) return false;
    return true;
  };

  const canInterruptInitialIce = () => !isInitialIcePhase();

  const markNegotiationComplete = () => {
    initialNegotiationCompleteRef.current = true;
    negotiationQueuedRef.current = false;
    logWebRTC("INITIAL_NEGOTIATION_COMPLETE", { callId: callIdRef.current });
  };

  const tryRestartIceWithoutSdp = (reason) => {
    if (P2P_ONLY_MODE) {
      logWebRTC("ICE_RESTART_WITHOUT_SDP_BLOCKED", { reason, mode: "p2p_only" });
      return false;
    }
    auditAction("restartIce()", reason);
    if (!canInterruptInitialIce()) {
      logWebRTC("ICE_RESTART_WITHOUT_SDP_BLOCKED", { reason, phase: "initial" });
      return false;
    }
    const pc = pcRef.current;
    if (!pc || typeof pc.restartIce !== "function") return false;
    if (["checking", "connected", "completed"].includes(pc.iceConnectionState)) {
      logWebRTC("ICE_RESTART_WITHOUT_SDP_BLOCKED", { reason, iceState: pc.iceConnectionState });
      return false;
    }
    try {
      timelineBump("restartIceCalls", { reason });
      pc.restartIce();
      logWebRTC("ICE_RESTART_WITHOUT_SDP", { reason });
      return true;
    } catch (err) {
      log.warn("restartIce() failed:", err);
      return false;
    }
  };

  const sendIceRestartOffer = async (reason) => {
    if (P2P_ONLY_MODE) {
      logWebRTC("SDP_OFFER_BLOCKED", { reason, mode: "p2p_only" });
      return false;
    }
    auditAction("createOffer(iceRestart)", reason);
    if (!canInterruptInitialIce()) {
      logWebRTC("SDP_OFFER_BLOCKED", { reason, detail: "initial_ice_phase" });
      timelineBump("offersIgnored", { reason: "initial_ice_phase" });
      return false;
    }
    const pc = pcRef.current;
    if (!pc || !isInitiatorRef.current || iceRestartInFlightRef.current) return false;
    if (isNegotiatingRef.current || pc.signalingState !== "stable") return false;

    iceRestartInFlightRef.current = true;
    try {
      timelineLog("CREATE_OFFER", { iceRestart: true, reason });
      const offer = await pc.createOffer({ iceRestart: true });
      timelineBump("offersCreated", { reason, iceRestart: true });
      timelineLog("SET_LOCAL_DESCRIPTION_OFFER", { iceRestart: true, reason });
      await pc.setLocalDescription(offer);
      sendSignaling({ action: "offer", sdp: offer.sdp });
      timelineBump("offersSent", { reason, iceRestart: true });
      timelineLog("OFFER_SENT", { reason, iceRestart: true });
      logWebRTC("SDP_OFFER_SENT", { reason, iceRestart: true });
      return true;
    } catch (err) {
      log.error("ICE restart offer failed:", err);
      return false;
    } finally {
      iceRestartInFlightRef.current = false;
    }
  };

  const getRouteClassification = (localType, remoteType) => {
    if (!localType || !remoteType) return "unknown";
    const l = localType.toLowerCase();
    const r = remoteType.toLowerCase();
    if (l === "relay" || r === "relay") return "relay-relay";
    if (l === "host" && r === "host") return "host-host";
    if (l === "srflx" || r === "srflx") return "srflx-srflx";
    return `${l}-${r}`;
  };

  const notifyMediaConnected = () => {
    if (mediaConnectedSentRef.current || !callIdRef.current) return;
    mediaConnectedSentRef.current = true;
    sendSignaling({ action: "media_connected", call_id: callIdRef.current });
    logWebRTC("MEDIA_CONNECTED_SENT", { callId: callIdRef.current });
  };

  const escalateToTurn = async () => {
    if (P2P_ONLY_MODE) {
      log.turn("TURN disabled — P2P_ONLY_MODE is active.");
      return;
    }
    // Hybrid mode loads TURN at PC creation — mid-call setConfiguration disrupts ICE pairing.
    if (CONNECTION_MODE === "hybrid") {
      log.turn("TURN already in initial ICE config (hybrid mode) — skipping setConfiguration.");
      turnEscalatedRef.current = true;
      return;
    }
    auditAction("setConfiguration(TURN)", "turn_escalation");
    if (!canInterruptInitialIce()) {
      log.turn("TURN escalation deferred — initial ICE phase still running.");
      return;
    }
    const pc = pcRef.current;
    if (!pc || turnEscalatedRef.current) return;

    turnEscalatedRef.current = true;
    turnFallbackOccurredRef.current = true;
    log.turn("Escalating ICE config to include TURN servers.");

    try {
      const res = await callAPI.getIceServers(false, false);
      const turnServers = mapIceServersFromApi(res?.iceServers);
      const fullConfig = buildRtcConfiguration([...DEFAULT_STUN_SERVERS, ...turnServers]);
      timelineBump("setConfigurationCalls", { reason: "turn_escalation" });
      pc.setConfiguration(fullConfig);
      log.turn("TURN servers applied via setConfiguration.");
    } catch (err) {
      log.error("TURN escalation failed:", err);
    }
  };

  const beginInitialIceRecovery = async () => {
    const pc = pcRef.current;
    if (!pc) return;
    const ice = pc.iceConnectionState;
    if (ice === "connected" || ice === "completed") return;

    logWebRTC("INITIAL_ICE_RECOVERY_START", {
      iceState: ice,
      connectionState: pc.connectionState,
      elapsedMs: Date.now() - connectionStartTimeRef.current,
      mode: P2P_ONLY_MODE ? "p2p_only" : "full",
    });

    if (P2P_ONLY_MODE) {
      logWebRTC("P2P_ONLY_TIMEOUT", {
        callId: callIdRef.current,
        counters: { ...callTimelineRef.current.counters },
        hint: "Symmetric NAT / CGNAT cannot be hole-punched with STUN alone. Use CONNECTION_MODE=hybrid.",
      });
      setCallErrorMessage("P2P connection timed out. Try the same Wi-Fi network on both devices.");
      return;
    }

    setCallErrorMessage("Still connecting — trying alternate routes...");
    if (!turnEscalatedRef.current) await escalateToTurn();
    if (tryRestartIceWithoutSdp("initial_timeout")) return;
    if (isInitiatorRef.current) {
      await sendIceRestartOffer("ice_restart_recovery");
    }
  };

  const startInitialIceMonitor = () => {
    if (initialIceTimeoutRef.current) clearTimeout(initialIceTimeoutRef.current);
    const timeoutMs = adaptiveIceTimeoutMsRef.current || INITIAL_ICE_TIMEOUT_MS;
    initialIceTimeoutRef.current = setTimeout(async () => {
      const pc = pcRef.current;
      if (!pc) return;
      if (iceConnectedTimeRef.current > 0) return;

      initialIcePhaseExpiredRef.current = true;
      logWebRTC("INITIAL_ICE_TIMEOUT", {
        elapsedMs: timeoutMs,
        adaptive: true,
        prediction: connectionPredictionRef.current?.p2p_success_probability,
        iceState: pc.iceConnectionState,
        connectionState: pc.connectionState,
        localCandidates: { ...candidateCountsRef.current },
        localFamilies: { ...localCandidateFamiliesRef.current },
        remoteFamilies: { ...remoteCandidateFamiliesRef.current },
      });
      await beginInitialIceRecovery();
    }, timeoutMs);
  };

  const handleAddExtraMinutes = async (minutes = 60) => {
    setIsAddingMinutes(true);
    try {
      const res = await callAPI.addMinutes(minutes);
      setQuotaWarning(null);
      alert(`Added ${res.minutes_added || minutes} extra minutes. You can keep calling.`);
    } catch (err) {
      alert(err.message || "Could not add extra minutes. Please try again.");
    } finally {
      setIsAddingMinutes(false);
    }
  };

  const sendSignaling = (payload) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      log.signaling("send →", payload.action || payload.type);
      socketRef.current.send(JSON.stringify(payload));
    } else {
      log.warn("sendSignaling: socket not open. Queueing payload:", payload.action || payload.type);
      outgoingQueueRef.current.push(payload);
    }
  };

  const flushOutgoingSignalingQueue = () => {
    if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) return;
    const queue = [...outgoingQueueRef.current];
    outgoingQueueRef.current = [];
    if (queue.length > 0) {
      log.signaling(`Flushing ${queue.length} queued outgoing signaling messages.`);
      for (const payload of queue) {
        socketRef.current.send(JSON.stringify(payload));
      }
    }
  };

  const trace = (stage, message, data = {}) => {
    console.log(`[${stage}] ${message}`, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  };

  const transitionRTCState = (next, data = {}) => {
    const prev = rtcStateRef.current;
    if (prev === next) return;
    rtcStateRef.current = next;
    setDebugCurrentStep(next);
    trace("STATE", next.toLowerCase(), { previous: prev, ...data });
    logWebRTC("STATE_TRANSITION", { from: prev, to: next, ...data });
  };

  const runPeerOperation = (label, operation) => {
    const run = negotiationChainRef.current
      .catch(() => { })
      .then(async () => {
        trace("SDP", `${label} started`);
        const result = await operation();
        trace("SDP", `${label} completed`);
        return result;
      });
    negotiationChainRef.current = run.catch((err) => {
      log.error(`[SDP] ${label} failed:`, err);
    });
    return run;
  };

  const remoteSdpKey = (type, sdp) => `${type}:${sdp || ""}`;


  //need to be fixed later

  // const ensureTransceiver = (kind, track = null, pc = pcRef.current) => {
  //   if (!pc) return null;

  //   const cached = transceiversRef.current[kind];
  //   if (cached && cached.direction !== "stopped") return cached;

  //   const existing = pc.getTransceivers().find((transceiver) => (
  //     transceiver.sender?.track?.kind === kind ||
  //     transceiver.receiver?.track?.kind === kind ||
  //     transceiver.mid === kind
  //   ) && transceiver.direction !== "stopped");
  //   if (existing) {
  //     transceiversRef.current[kind] = existing;
  //     trace("MEDIA", `${kind} transceiver reused`, { mid: existing.mid, direction: existing.direction });
  //     return existing;
  //   }

  //   if (initialNegotiationStartedRef.current) {
  //     throw new Error(`Refusing to add ${kind} transceiver after initial negotiation started`);
  //   }

  //   const needsVideo = callTypeRef.current === "video" || callTypeRef.current === "blind_date";
  //   const direction = kind === "video" && !needsVideo ? "inactive" : "sendrecv";
  //   const init = { direction };

  //   if (track) {
  //     init.streams = [localStreamRef.current].filter(Boolean);
  //   }
  //   // NOTE: Do NOT set sendEncodings with rid here. Simulcast with rid requires
  //   // both peers to pre-negotiate a=simulcast lines in the SDP. The callee creates
  //   // its transceiver in response to the offer (no rid), so the m-line is
  //   // negotiated without simulcast — mismatched rids cause ontrack to fire with a
  //   // muted/ended track on Firefox, and silently kill layers on Chrome.
  //   // Bitrate limits are applied post-negotiation via sender.setParameters().

  //   const transceiver = track
  //     ? pc.addTransceiver(track, init)
  //     : pc.addTransceiver(kind, init);
  //   transceiversRef.current[kind] = transceiver;
  //   trace("MEDIA", `${kind} transceiver created`, { direction });
  //   logWebRTC("TRANSCEIVER_CREATED", { kind, direction });
  //   return transceiver;
  // };




  const ensureTransceiver = (kind, track = null, pc = pcRef.current) => {
    if (!pc) return null;

    const cached = transceiversRef.current[kind];
    if (cached && cached.direction !== "stopped") return cached;

    const allTransceivers = pc.getTransceivers();

    // FIX 3: Match by sender OR receiver track kind.
    // The callee path: after setRemoteDescription, the receiver track is already
    // set (kind = audio/video) but sender track is null. Old code checked
    // sender?.track?.kind which is null on the callee — causing this to miss.
    // Now we also check receiver?.track?.kind so callee transceivers are found.
    const byTrack = allTransceivers.find((t) => {
      const sKind = t.sender?.track?.kind;
      const rKind = t.receiver?.track?.kind;
      return (sKind === kind || rKind === kind) && t.direction !== "stopped";
    });
    if (byTrack) {
      transceiversRef.current[kind] = byTrack;
      trace("MEDIA", `${kind} transceiver matched by track kind`, {
        mid: byTrack.mid,
        direction: byTrack.direction,
        senderTrackKind: byTrack.sender?.track?.kind || null,
        receiverTrackKind: byTrack.receiver?.track?.kind || null,
      });
      return byTrack;
    }

    // Second: match by mid value from the SDP (audio=mid"0", video=mid"1" in
    // most negotiated sessions). This is a fallback for transceivers that exist
    // from setRemoteDescription but whose receiver.track is not yet populated
    // (e.g. older browser builds).
    const midIndex = kind === "audio" ? "0" : "1";
    const byMid = allTransceivers.find((t) =>
      t.mid === midIndex && t.direction !== "stopped"
    );
    if (byMid) {
      transceiversRef.current[kind] = byMid;
      trace("MEDIA", `${kind} transceiver matched by mid`, { mid: byMid.mid, direction: byMid.direction });
      return byMid;
    }

    // Third fallback: match by SDP order (index 0 = audio, index 1 = video)
    // in case mid is null before first ICE connection.
    const byIndex = allTransceivers.filter((t) => t.direction !== "stopped")[kind === "audio" ? 0 : 1];
    if (byIndex) {
      transceiversRef.current[kind] = byIndex;
      trace("MEDIA", `${kind} transceiver matched by array index`, { mid: byIndex.mid, direction: byIndex.direction });
      return byIndex;
    }

    // Fourth: only create new if no negotiation has started
    if (initialNegotiationStartedRef.current) {
      throw new Error(`Refusing to add ${kind} transceiver after initial negotiation started`);
    }

    // For new transceivers, derive direction from both callTypeRef and stream state
    const streamHasVideo =
      kind === "video" && localStreamRef.current?.getVideoTracks()[0]?.readyState === "live";
    const callTypeNeedsVideo =
      callTypeRef.current === "video" || callTypeRef.current === "blind_date";
    const direction = kind === "video" && !(callTypeNeedsVideo || streamHasVideo) ? "inactive" : "sendrecv";
    const init = { direction };
    if (track) init.streams = [localStreamRef.current].filter(Boolean);

    const transceiver = track
      ? pc.addTransceiver(track, init)
      : pc.addTransceiver(kind, init);

    transceiversRef.current[kind] = transceiver;
    trace("MEDIA", `${kind} transceiver newly created`, { direction });
    logWebRTC("TRANSCEIVER_CREATED", { kind, direction });
    return transceiver;
  };














  const getMediaConstraints = (needsVideo) => ({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: needsVideo ? {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 24 },
    } : false,
  });

  const acquireLocalMedia = async (needsVideo) => {
    try {
      const constraints = getMediaConstraints(needsVideo);
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (firstErr) {
      log.warn("getUserMedia with ideal constraints failed, trying simple constraints:", firstErr);
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: needsVideo ? { width: 640, height: 480 } : false,
        });
      } catch (secondErr) {
        log.warn("getUserMedia with simple constraints failed, trying minimal constraints:", secondErr);
        return await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: needsVideo,
        });
      }
    }
  };

  const assertMediaTracksReady = () => {
    const localStream = localStreamRef.current;
    if (!localStream) throw new Error("Local media stream is not available");

    const audioTrack = localStream.getAudioTracks()[0];
    if (!audioTrack) throw new Error("Missing audio track");
    if (!audioTrack.enabled || audioTrack.readyState !== "live") {
      throw new Error(`Audio track not ready: enabled=${audioTrack.enabled} readyState=${audioTrack.readyState}`);
    }

    // Use stream presence as ground-truth for video (consistent with syncSendersWithTracks).
    // callTypeRef may be briefly stale on the callee; if the stream already has a
    // live video track, we must validate it regardless of what the ref says.
    const callTypeNeedsVideo = callTypeRef.current === "video" || callTypeRef.current === "blind_date";
    const streamHasVideo = !!localStream.getVideoTracks()[0];
    const needsVideo = callTypeNeedsVideo || streamHasVideo;
    if (needsVideo) {
      const videoTrack = localStream.getVideoTracks()[0];
      if (!videoTrack) throw new Error("Missing video track before SDP offer");
      if (!videoTrack.enabled || videoTrack.readyState !== "live") {
        throw new Error(`Video track not ready: enabled=${videoTrack.enabled} readyState=${videoTrack.readyState}`);
      }
    }
    trace("MEDIA", "tracks ready", { needsVideo, callTypeNeedsVideo, streamHasVideo });
  };

  const syncSendersWithTracks = async (pc = pcRef.current) => {
    if (!pc || !localStreamRef.current) return;

    assertMediaTracksReady();
    const audioTrack = localStreamRef.current.getAudioTracks()[0];
    const videoTrack = localStreamRef.current.getVideoTracks()[0] || null;

    // FIX 2: Derive needsVideo from BOTH the callTypeRef AND whether the local
    // stream actually contains a live video track.
    // On the callee side, callTypeRef.current may briefly be stale (React state
    // hasn't flushed yet) but getUserMedia in acceptCall() already captured video
    // tracks if the call is a video call — so checking the stream is the
    // ground-truth source and prevents the video transceiver from being set to
    // 'inactive' when callTypeRef still reads 'voice'.
    const callTypeNeedsVideo =
      callTypeRef.current === "video" || callTypeRef.current === "blind_date";
    const streamHasVideo =
      videoTrack !== null && videoTrack.readyState === "live";
    const needsVideo = callTypeNeedsVideo || streamHasVideo;

    logWebRTC("SYNC_SENDERS", {
      callType: callTypeRef.current,
      callTypeNeedsVideo,
      streamHasVideo,
      needsVideo,
      videoTrackId: videoTrack?.id || null,
    });

    const audioTransceiver = ensureTransceiver("audio", audioTrack, pc);
    if (audioTransceiver.sender.track !== audioTrack) {
      await audioTransceiver.sender.replaceTrack(audioTrack);
    }
    audioTransceiver.direction = "sendrecv";
    trace("MEDIA", "audio sender attached", {
      enabled: audioTrack.enabled,
      readyState: audioTrack.readyState,
    });

    const videoTransceiver = ensureTransceiver("video", needsVideo ? videoTrack : null, pc);
    if (needsVideo) {
      if (videoTransceiver.sender.track !== videoTrack) {
        await videoTransceiver.sender.replaceTrack(videoTrack);
      }
      videoTransceiver.direction = "sendrecv";
      trace("MEDIA", "video sender attached", {
        enabled: videoTrack?.enabled,
        readyState: videoTrack?.readyState,
        direction: videoTransceiver.direction,
      });
    } else {
      if (videoTransceiver.sender.track) {
        await videoTransceiver.sender.replaceTrack(null);
      }
      videoTransceiver.direction = "inactive";
      trace("MEDIA", "video sender inactive for voice call");
    }
  };

  const setupDataChannel = (pc = pcRef.current, isInitiator = isInitiatorRef.current) => {
    if (!pc) return;
    if (dataChannelRef.current) return;
    pc.ondatachannel = (event) => {
      dataChannelRef.current = event.channel;
      wireDataChannel(event.channel, "remote");
    };
    if (!isInitiator || dataChannelRef.current) return;
    if (initialNegotiationStartedRef.current) {
      trace("SDP", "datachannel creation skipped after initial negotiation");
      return;
    }
    const channel = pc.createDataChannel("call-control", { ordered: true });
    dataChannelRef.current = channel;
    wireDataChannel(channel, "local");
    trace("SDP", "datachannel created pre-offer", { label: channel.label });
  };

  const wireDataChannel = (channel, origin) => {
    channel.onopen = () => trace("SDP", "datachannel open", { origin, label: channel.label });
    channel.onclose = () => trace("SDP", "datachannel closed", { origin, label: channel.label });
    channel.onerror = (event) => log.error("[SDP] datachannel error:", event);
  };

  const createAndSendOffer = async (options = {}, reason = "initial") => {
    auditAction("createOffer()", reason, { iceRestart: !!options.iceRestart });
    if (!ALLOWED_OFFER_REASONS.has(reason)) {
      logWebRTC("SDP_OFFER_BLOCKED", { reason });
      timelineBump("offersIgnored", { reason });
      return false;
    }
    if (!canInterruptInitialIce() && reason !== "initial") {
      logWebRTC("SDP_OFFER_BLOCKED", { reason, detail: "initial_ice_phase" });
      timelineBump("offersIgnored", { reason: "initial_ice_phase" });
      return false;
    }
    if (reason === "initial" && initialNegotiationStartedRef.current) {
      logWebRTC("SDP_OFFER_BLOCKED", { reason: "initial_already_started" });
      timelineBump("offersIgnored", { reason: "initial_already_started" });
      return false;
    }
    if (isNegotiatingRef.current) {
      logWebRTC("SDP_OFFER_BLOCKED", { reason, detail: "negotiation_in_progress" });
      timelineBump("offersIgnored", { reason: "negotiation_in_progress" });
      return false;
    }

    return runPeerOperation(`createOffer:${reason}`, async () => {
      const pc = pcRef.current;
      if (!pc) return false;
      if (pc.signalingState !== "stable") {
        logWebRTC("NEGOTIATION_SKIPPED", { reason, signalingState: pc.signalingState });
        return false;
      }

      isNegotiatingRef.current = true;
      try {
        transitionRTCState("CREATING_OFFER", { reason });
        await syncSendersWithTracks(pc);
        if (reason === "initial") {
          setupDataChannel(pc, isInitiatorRef.current);
          initialNegotiationStartedRef.current = true;
        }
        timelineLog("CREATE_OFFER", { reason });
        const offer = await pc.createOffer(options);
        timelineBump("offersCreated", { reason });
        logWebRTC("SDP_OFFER_CREATED", { sdpType: "offer", reason, offerCreatedAt: Date.now() });
        timelineLog("SET_LOCAL_DESCRIPTION_OFFER", { reason });
        await pc.setLocalDescription(offer);
        logWebRTC("SDP_LOCAL_DESC_SET", { sdpType: "offer", reason });
        offerCreatedTimeRef.current = Date.now();
        transitionRTCState("WAITING_ANSWER", { reason });
        sendSignaling({ action: "offer", sdp: offer.sdp });
        timelineBump("offersSent", { reason });
        timelineLog("OFFER_SENT", { reason });
        logWebRTC("SDP_OFFER_SENT", { reason });
        return true;
      } finally {
        isNegotiatingRef.current = false;
      }
    });
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 9 — TURN escalation timer management (clear on reuse)
  // ───────────────────────────────────────────────────────────────────────────
  const clearAllTimers = () => {
    if (initialIceTimeoutRef.current) { clearTimeout(initialIceTimeoutRef.current); initialIceTimeoutRef.current = null; }
    if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
    if (failureDiagnosisTimeoutRef.current) { clearTimeout(failureDiagnosisTimeoutRef.current); failureDiagnosisTimeoutRef.current = null; }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 9 — WebRTC Auto-Diagnosis Classification Engine
  // Runs 15s after connection establishment starts, classifies failure mode.
  // ───────────────────────────────────────────────────────────────────────────
  const runFailureClassification = () => {
    const pc = pcRef.current;
    if (!pc) return;

    let reason = "UNKNOWN";
    const iceState = pc.iceConnectionState;
    const connState = pc.connectionState;
    const hasMedia = firstMediaReceivedTimeRef.current > 0;

    // DTLS failed states
    const dtlsFailed = connState === "failed" || connState === "closed";

    // Video render check (ensure video element state is ready and rendering)
    const remoteVideo = remoteVideoRef.current;
    const isVideoRendering = remoteVideo &&
      remoteVideo.readyState >= 3 && // HAVE_FUTURE_DATA
      !remoteVideo.paused &&
      remoteVideo.videoWidth > 0 &&
      remoteVideo.currentTime > 0;

    if (iceState === "failed" || iceState === "disconnected") {
      reason = "ICE_FAILURE";
    } else if (dtlsFailed) {
      reason = "DTLS_FAILURE";
    } else if (!selectedCandidatePairRef.current && iceState !== "connected" && iceState !== "completed") {
      reason = "ICE_PAIRING_FAILURE";
    } else if (!hasMedia) {
      reason = "MEDIA_NOT_FLOWING";
    } else if (remoteVideo && !isVideoRendering) {
      reason = "RENDERING_ISSUE";
    } else if (hasMedia && (iceState === "connected" || iceState === "completed")) {
      reason = "SUCCESS";
    }

    setDebugMediaStatus(hasMedia ? (isVideoRendering ? "Media Flowing & Rendering" : "Media Received (Not Rendering)") : "Failed: " + reason);

    logWebRTC("FINAL_DIAGNOSIS", {
      reason,
      iceConnectionState: iceState,
      connectionState: connState,
      hasMedia,
      firstMediaReceivedTimeMs: firstMediaReceivedTimeRef.current > 0
        ? firstMediaReceivedTimeRef.current - callStartTimeRef.current
        : null,
      selectedPair: selectedCandidatePairRef.current,
      videoRender: remoteVideo ? {
        readyState: remoteVideo.readyState,
        paused: remoteVideo.paused,
        videoWidth: remoteVideo.videoWidth,
        videoHeight: remoteVideo.videoHeight,
        currentTime: remoteVideo.currentTime,
        srcObjectSet: !!remoteVideo.srcObject,
      } : null,
    });
  };


  // ───────────────────────────────────────────────────────────────────────────
  // Phase 7 — Stats collection
  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // Phase 5+7+8 — Stats collection
  // Interval is 2s during initial connection phase, then 5s once stable.
  // ───────────────────────────────────────────────────────────────────────────
  const startStatsLoop = () => {
    if (statsIntervalRef.current) clearInterval(statsIntervalRef.current);
    // Start at 2s for fast DTLS/ICE diagnostics, bump to 5s after 30s
    let intervalMs = 2000;
    statsIntervalRef.current = setInterval(async () => {
      if (!pcRef.current) return;
      try {
        const stats = await pcRef.current.getStats();
        processStats(stats);
        await logTransportStats(stats); // Phase 5 — DTLS inspection
      } catch (err) {
        log.error("[STATS] getStats failed:", err);
      }
    }, intervalMs);
    // After 30s slow down to 5s
    setTimeout(() => {
      if (!statsIntervalRef.current) return;
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = setInterval(async () => {
        if (!pcRef.current) return;
        try {
          const stats = await pcRef.current.getStats();
          processStats(stats);
        } catch (err) {
          log.error("[STATS] getStats failed:", err);
        }
      }, 5000);
    }, 30000);
    logWebRTC("STATS_LOOP_STARTED", { initialIntervalMs: intervalMs });
  };

  const stopStatsLoop = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
      logWebRTC("STATS_LOOP_STOPPED", {});
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 5 — DTLS diagnostics (CRITICAL for black screen)
  // Inspects the "transport" stat report which contains dtlsState.
  // Called every 2s during connection phase, and once on connectionState=connected.
  // ───────────────────────────────────────────────────────────────────────────
  const logTransportStats = async (statsMap) => {
    const stats = statsMap || (pcRef.current ? await pcRef.current.getStats().catch(() => null) : null);
    if (!stats) return;
    stats.forEach((report) => {
      if (report.type === "transport") {
        logWebRTC("DTLS_STATE", {
          dtlsState: report.dtlsState,
          selectedCandidatePairId: report.selectedCandidatePairId,
          tlsVersion: report.tlsVersion || null,
          dtlsCipher: report.dtlsCipher || null,
          srtpCipher: report.srtpCipher || null,
          iceRole: report.iceRole || null,
          iceLocalUsernameFragment: report.iceLocalUsernameFragment || null,
          bytesSent: report.bytesSent || 0,
          bytesReceived: report.bytesReceived || 0,
          packetsSent: report.packetsSent || 0,
          packetsReceived: report.packetsReceived || 0,
        });
      }
    });
  };

  const processStats = (stats) => {
    let rtt = null, packetsLost = 0, packetsSent = 0, jitter = null;
    let bytesSent = 0, selectedPair = null;

    stats.forEach((report) => {
      // Phase 7 — identify active candidate pair
      if (
        report.type === "candidate-pair" &&
        report.state === "succeeded" &&
        report.nominated
      ) {
        selectedPair = report;
        if (report.currentRoundTripTime !== undefined) {
          rtt = report.currentRoundTripTime * 1000;
        }
        candidatePairAnalyticsRef.current = {
          currentRoundTripTime: rtt,
          availableOutgoingBitrate: report.availableOutgoingBitrate || null,
          requestsReceived: report.requestsReceived || 0,
          responsesReceived: report.responsesReceived || 0,
          totalRoundTripTime: report.totalRoundTripTime !== undefined
            ? report.totalRoundTripTime * 1000 : null,
          state: report.state,
          nominated: report.nominated,
        };
      }
      if (report.type === "outbound-rtp" && report.kind === "video") {
        packetsSent = report.packetsSent || 0;
        bytesSent = report.bytesSent || 0;
      }
      if (report.type === "remote-inbound-rtp" && report.kind === "video") {
        if (report.roundTripTime !== undefined) rtt = report.roundTripTime * 1000;
        if (report.packetsLost !== undefined) packetsLost = report.packetsLost;
        if (report.jitter !== undefined) jitter = report.jitter * 1000;
      }
    });

    if (rtt === null && selectedPair?.currentRoundTripTime !== undefined) {
      rtt = selectedPair.currentRoundTripTime * 1000;
    }

    if (selectedPair) {
      const localCand = stats.get(selectedPair.localCandidateId);
      const remoteCand = stats.get(selectedPair.remoteCandidateId);
      if (localCand && remoteCand) {
        const lType = localCand.candidateType || parseCandidateType(localCand.candidate);
        const rType = remoteCand.candidateType || parseCandidateType(remoteCand.candidate);
        const lip = localCand.ip || localCand.address || '';
        const rip = remoteCand.ip || remoteCand.address || '';
        const localFamily = isIpv6Address(lip) ? "ipv6" : "ipv4";
        const remoteFamily = isIpv6Address(rip) ? "ipv6" : "ipv4";
        selectedCandidatePairRef.current = {
          localType: lType,
          remoteType: rType,
          protocol: localCand.protocol || selectedPair.protocol,
          localIp: lip,
          remoteIp: rip,
          localFamily,
          remoteFamily,
          pathFamily: localFamily === "ipv6" && remoteFamily === "ipv6" ? "ipv6" : "ipv4",
        };
        // Phase 7 — detect TURN usage from active pair
        if (lType === "relay" || rType === "relay") {
          if (!turnFallbackOccurredRef.current) {
            turnFallbackOccurredRef.current = true;
            log.turn("TURN relay detected in active candidate pair.");
          }
        }
        // Phase 8 — structured log for candidate pair analysis
        timelineLog("SELECTED_CANDIDATE_PAIR", {
          localType: lType,
          remoteType: rType,
          localIp: selectedCandidatePairRef.current.localIp,
          remoteIp: selectedCandidatePairRef.current.remoteIp,
        });
        logWebRTC("CANDIDATE_PAIR_ANALYSIS", {
          localCandidateType: lType || "unknown",
          remoteCandidateType: rType || "unknown",
          localFamily,
          remoteFamily,
          pathFamily: selectedCandidatePairRef.current.pathFamily,
          preferIpv6: preferIpv6Ref.current,
          protocol: localCand.protocol || selectedPair.protocol || "unknown",
          nominated: selectedPair.nominated,
          state: selectedPair.state,
          rtt: rtt,
          localIp: localCand.ip || localCand.address || null,
          remoteIp: remoteCand.ip || remoteCand.address || null,
        });
        log.stats(
          `Active pair: Local[${lType}] ${selectedCandidatePairRef.current.localIp}` +
          ` <-> Remote[${rType}] ${selectedCandidatePairRef.current.remoteIp}`
        );
      }
    }

    if (rtt !== null) {
      rttHistoryRef.current.push(rtt);
      if (rttHistoryRef.current.length > 5) rttHistoryRef.current.shift();
      rttAverageRef.current = rttHistoryRef.current.reduce((a, b) => a + b, 0) / rttHistoryRef.current.length;
      maxRttRef.current = Math.max(maxRttRef.current, rtt);
    }
    if (jitter !== null) jitterAverageRef.current = jitter;
    if (lastStatsRef.current && packetsSent > lastStatsRef.current.packetsSent) {
      const ds = packetsSent - lastStatsRef.current.packetsSent;
      const dl = (packetsLost || 0) - (lastStatsRef.current.packetsLost || 0);
      if (ds > 0) lossAverageRef.current = Math.max(0, dl / (ds + dl));
    } else if (packetsSent > 0) {
      lossAverageRef.current = (packetsLost || 0) / (packetsSent + (packetsLost || 0));
    }
    if (lossAverageRef.current > 0) {
      maxPacketLossRef.current = Math.max(maxPacketLossRef.current, lossAverageRef.current);
    }
    lastStatsRef.current = { packetsSent, packetsLost, bytesSent };

    if (callTypeRef.current === "video" || callTypeRef.current === "blind_date") {
      adjustVideoBitrate();
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 8 — Adaptive video bitrate (India-tuned thresholds)
  // ───────────────────────────────────────────────────────────────────────────
  const adjustVideoBitrate = async () => {
    if (!pcRef.current) return;
    const videoSender = pcRef.current.getSenders().find(s => s.track?.kind === "video");
    if (!videoSender) return;

    const rtt = rttAverageRef.current;
    const loss = lossAverageRef.current;
    let targetBitrate;

    if (rtt > 600 || loss > 0.15) targetBitrate = 150 * 1000;
    else if (rtt > 400 || loss > 0.10) targetBitrate = 250 * 1000;
    else if (rtt > 250 || loss > 0.05) targetBitrate = 400 * 1000;
    else if (rtt < 150 && loss < 0.02) targetBitrate = Math.min(600 * 1000, currentBitrateRef.current + 50 * 1000);
    else targetBitrate = Math.min(600 * 1000, currentBitrateRef.current);

    if (targetBitrate === currentBitrateRef.current) return;

    try {
      const params = videoSender.getParameters();
      if (params.encodings?.length > 0) {
        params.encodings.forEach((enc) => {
          if (enc.rid === "low") { enc.active = true; enc.maxBitrate = 120000; }
          else if (enc.rid === "mid") { enc.active = targetBitrate > 200000; enc.maxBitrate = Math.min(350000, targetBitrate); }
          else if (enc.rid === "high") { enc.active = targetBitrate > 400000; enc.maxBitrate = targetBitrate; }
          else { enc.maxBitrate = targetBitrate; }
        });
        await videoSender.setParameters(params);
        currentBitrateRef.current = targetBitrate;
        bitrateHistoryRef.current.push(targetBitrate / 1000);
        log.stats(`Bitrate → ${targetBitrate / 1000}kbps  RTT=${Math.round(rtt)}ms loss=${Math.round(loss * 100)}%`);
      }
    } catch (err) {
      log.error("[Bitrate] setParameters failed:", err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 7 — Metrics submission
  // ───────────────────────────────────────────────────────────────────────────
  const submitCallMetrics = async () => {
    if (!callIdRef.current || metricsSubmittedRef.current) return;
    metricsSubmittedRef.current = true;

    const establishmentTime = connectionEndTimeRef.current > 0 && connectionStartTimeRef.current > 0
      ? (connectionEndTimeRef.current - connectionStartTimeRef.current) / 1000
      : null;
    const gatheringTime = iceGatheringEndTimeRef.current > 0 && iceGatheringStartTimeRef.current > 0
      ? (iceGatheringEndTimeRef.current - iceGatheringStartTimeRef.current) / 1000
      : null;
    const avgBitrate = bitrateHistoryRef.current.length > 0
      ? bitrateHistoryRef.current.reduce((a, b) => a + b, 0) / bitrateHistoryRef.current.length
      : null;
    const route = selectedCandidatePairRef.current
      ? getRouteClassification(
        selectedCandidatePairRef.current.localType,
        selectedCandidatePairRef.current.remoteType,
      )
      : "unknown";
    const pathFamily = selectedCandidatePairRef.current?.pathFamily || "unknown";
    const connectionType = pathFamily === "ipv6" ? `${route}-ipv6` : route;

    // Phase 7 — full analytics payload
    const payload = {
      call_session_id: callIdRef.current,
      connection_establishment_time: establishmentTime,
      ice_gathering_time: gatheringTime,
      ice_completion_time: gatheringTime,
      local_candidate_types: localCandidateTypesRef.current,
      remote_candidate_types: remoteCandidateTypesRef.current,
      local_candidate_families: localCandidateFamiliesRef.current,
      remote_candidate_families: remoteCandidateFamiliesRef.current,
      selected_local_candidate_type: selectedCandidatePairRef.current?.localType || null,
      selected_remote_candidate_type: selectedCandidatePairRef.current?.remoteType || null,
      p2p_success: iceConnectedTimeRef.current > 0 && !turnFallbackOccurredRef.current,
      turn_fallback_occurrence: turnFallbackOccurredRef.current,
      average_rtt: rttAverageRef.current > 0 ? rttAverageRef.current : null,
      max_rtt: maxRttRef.current > 0 ? maxRttRef.current : null,
      average_packet_loss: lossAverageRef.current,
      average_jitter: jitterAverageRef.current > 0 ? jitterAverageRef.current : null,
      average_bitrate_kbps: avgBitrate,
      recovery_attempts: recoveryAttemptsRef.current,
      connection_type: connectionType,
      connection_establishment_ms: establishmentTime ? establishmentTime * 1000 : null,
      max_packet_loss: maxPacketLossRef.current,
      turn_fallback_count: turnFallbackOccurredRef.current ? 1 : 0,
      // Extended Phase 7 fields
      fallback_used: turnEscalatedRef.current,
      failure_reason: pathFamily === "ipv6"
        ? "ipv6_path"
        : (preferIpv6Ref.current ? "ipv4_path_despite_dual_ipv6" : ""),
      ice_connected_at_ms: iceConnectedTimeRef.current > 0
        ? iceConnectedTimeRef.current - callStartTimeRef.current : null,
      first_media_received_at_ms: firstMediaReceivedTimeRef.current > 0
        ? firstMediaReceivedTimeRef.current - callStartTimeRef.current : null,
      offer_to_answer_ms: answerReceivedTimeRef.current > 0 && offerCreatedTimeRef.current > 0
        ? answerReceivedTimeRef.current - offerCreatedTimeRef.current : null,
    };

    log.stats("Submitting metrics:", payload);
    try {
      await callAPI.submitMetrics(payload);
      log.stats("Metrics submitted successfully.");
    } catch (err) {
      log.warn("Metrics submission failed:", err);
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // ───────────────────────────────────────────────────────────────────────────
  // Safe ICE restart (ONLY fallback mechanism)
  // ───────────────────────────────────────────────────────────────────────────
  const restartIceClean = async () => {
    if (P2P_ONLY_MODE) {
      log.restart("ICE restart disabled in P2P_ONLY_MODE.");
      return;
    }
    const pc = pcRef.current;
    if (!pc) return;

    if (!canInterruptInitialIce()) {
      log.restart("ICE restart blocked — initial negotiation must complete without interruption.");
      return;
    }

    const iceState = pc.iceConnectionState;
    if (["checking", "connected", "completed"].includes(iceState)) {
      log.restart(`ICE restart blocked — state is ${iceState}.`);
      return;
    }

    const now = Date.now();
    if (now - lastIceRestartTimeRef.current < ICE_RESTART_COOLDOWN) {
      log.restart("ICE restart blocked by cooldown guard.");
      return;
    }
    lastIceRestartTimeRef.current = now;

    recoveryAttemptsRef.current += 1;
    log.restart(`ICE restart attempt ${recoveryAttemptsRef.current}/${maxRecoveryCyclesRef.current}...`);

    if (recoveryAttemptsRef.current > maxRecoveryCyclesRef.current) {
      if (!turnEscalatedRef.current) {
        await escalateToTurn();
        if (tryRestartIceWithoutSdp("recovery_turn_fallback")) return;
        if (isInitiatorRef.current) {
          await sendIceRestartOffer("ice_restart_recovery");
          return;
        }
      }
      log.error("Max recovery cycles exceeded. Ending call.");
      transitionRTCState("FAILED");
      setCallErrorMessage("Connection lost permanently.");
      cleanupCall();
      return;
    }

    coordinatedRestartApprovedRef.current = false;
    sendSignaling({ action: "ice_restart_request", call_id: callIdRef.current });

    if (tryRestartIceWithoutSdp("ice_restart_recovery")) return;

    if (isInitiatorRef.current) {
      if (coordinatedRestartApprovedRef.current) {
        await sendIceRestartOffer("ice_restart_recovery");
      } else {
        setTimeout(async () => {
          if (coordinatedRestartApprovedRef.current || canInterruptInitialIce()) {
            await sendIceRestartOffer("ice_restart_recovery");
          }
        }, 1200);
      }
    } else {
      log.restart("Non-initiator waiting for coordinated ICE restart approval.");
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 2+4 — Connection state listeners + full telemetry
  // Every state machine transition is logged with logWebRTC(stage, data)
  // ───────────────────────────────────────────────────────────────────────────
  const setupConnectionListeners = (pc, isInitiator) => {
    pc.onsignalingstatechange = () => {
      const prev = lastSignalingStateRef.current;
      const next = pc.signalingState;
      lastSignalingStateRef.current = next;
      trace("SDP", "signaling state changed", { signalingState: next });
      timelineLog("SIGNALING_STATE_CHANGED", { from: prev, to: next, state: next });
      logWebRTC("SIGNALING_STATE", { state: next, from: prev });
      if (pc.signalingState === "stable") {
        transitionRTCState("STABLE");
        negotiationQueuedRef.current = false;
      }
    };

    pc.onnegotiationneeded = () => {
      const ice = pc.iceConnectionState;
      if (ice === "connected" || ice === "completed") {
        logWebRTC("NEGOTIATION_NEEDED_IGNORED", {
          reason: "already_connected",
          iceState: ice,
        });
        return;
      }
      logWebRTC("NEGOTIATION_NEEDED_IGNORED", {
        signalingState: pc.signalingState,
        initialComplete: initialNegotiationCompleteRef.current,
        reason: "explicit_initial_offer_only",
      });
    };

    // ── ICE gathering state (Phase 2) ──
    pc.onicegatheringstatechange = () => {
      const state = pc.iceGatheringState;
      const elapsedMs = Date.now() - connectionStartTimeRef.current;
      logWebRTC("ICE_GATHERING_STATE", {
        state,
        elapsedMs,
        hostCount: candidateCountsRef.current.host,
        srflxCount: candidateCountsRef.current.srflx,
        relayCount: candidateCountsRef.current.relay,
      });
      if (state === "gathering") {
        transitionRTCState("GATHERING_CANDIDATES");
        if (iceGatheringStartTimeRef.current === 0) {
          iceGatheringStartTimeRef.current = Date.now();
          timelineLog("ICE_GATHERING_STARTED");
        }
      }
      if (state === "complete") {
        iceGatheringEndTimeRef.current = Date.now();
        const gatheringMs = iceGatheringEndTimeRef.current - iceGatheringStartTimeRef.current;
        logWebRTC("ICE_GATHERING_COMPLETE", {
          gatheringMs,
          totalCandidates:
            candidateCountsRef.current.host +
            candidateCountsRef.current.srflx +
            candidateCountsRef.current.relay,
          breakdown: { ...candidateCountsRef.current },
          families: { ...localCandidateFamiliesRef.current },
        });
      }
    };

    // ── ICE connection state (Phase 2) ──
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      const prev = lastIceStateRef.current;
      lastIceStateRef.current = state;
      const elapsedMs = Date.now() - connectionStartTimeRef.current;
      trace("ICE", "state changed", { state, elapsedMs });
      timelineLog("ICE_STATE_CHANGED", { from: prev, to: state, elapsedMs });
      logWebRTC("ICE_CONNECTION_STATE", { state, from: prev, elapsedMs });
      setDebugIceState(state);
      reportIceState(state, prev, elapsedMs);

      switch (state) {
        case "checking":
          transitionRTCState("CHECKING", { iceState: state });
          break;

        case "connected":
        case "completed":
          transitionRTCState("CONNECTED", { iceState: state });
          if (iceConnectedTimeRef.current === 0) {
            iceConnectedTimeRef.current = Date.now();
            const iceConnectMs = iceConnectedTimeRef.current - callStartTimeRef.current;
            logWebRTC("ICE_CONNECTED", { iceConnectMs, state });
            saveCandidateCache();
            notifyMediaConnected();
          }
          if (connectionEndTimeRef.current === 0) connectionEndTimeRef.current = Date.now();
          setIsReconnecting(false);
          setCallErrorMessage(null);
          recoveryAttemptsRef.current = 0;
          isRecoveringRef.current = false;
          if (initialIceTimeoutRef.current) { clearTimeout(initialIceTimeoutRef.current); initialIceTimeoutRef.current = null; }
          if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
          initialIcePhaseExpiredRef.current = true;
          startStatsLoop();

          // ── Receiver-track recovery (CALLER BLACK SCREEN FIX) ────────────────
          setTimeout(() => {
            const activePc = pcRef.current;
            if (!activePc) return;
            if (!remoteStreamRef.current) remoteStreamRef.current = new MediaStream();
            const stream = remoteStreamRef.current;
            let added = 0;
            for (const receiver of activePc.getReceivers()) {
              const { track } = receiver;
              if (!track || track.readyState !== "live") continue;
              if (!stream.getTracks().find(t => t.id === track.id)) {
                stream.addTrack(track);
                added++;
              }
            }
            if (added > 0 || stream.getTracks().length > 0) {
              const vid = remoteVideoRef.current;
              const aud = remoteAudioRef.current;
              if (vid && (vid.srcObject !== stream || added > 0)) {
                vid.srcObject = stream;
                vid.play().catch(() => { });
              }
              if (aud && (aud.srcObject !== stream || added > 0)) {
                aud.srcObject = stream;
                aud.play().catch(() => { });
              }
              if (added > 0) {
                logWebRTC("RECEIVER_TRACK_RECOVERY", {
                  tracksAdded: added,
                  totalTracks: stream.getTracks().length,
                  kinds: stream.getTracks().map(t => t.kind),
                });
                if (firstMediaReceivedTimeRef.current === 0) {
                  firstMediaReceivedTimeRef.current = Date.now();
                }
              }
            }
          }, 1500);
          break;

        case "disconnected": {
          const graceMs = isInitialIcePhase() ? INITIAL_DISCONNECT_GRACE_MS : DISCONNECT_GRACE_MS;
          logWebRTC("ICE_DISCONNECTED", { graceMs, initialPhase: isInitialIcePhase(), elapsedMs });
          setIsReconnecting(true);
          if (disconnectTimerRef.current) clearTimeout(disconnectTimerRef.current);
          disconnectTimerRef.current = setTimeout(async () => {
            if (!pcRef.current) return;
            const currentState = pcRef.current.iceConnectionState;
            if (currentState === "connected" || currentState === "completed") {
              logWebRTC("ICE_SELF_RECOVERED", { currentState });
              setIsReconnecting(false);
              return;
            }
            logWebRTC("ICE_DISCONNECTED_GRACE_ELAPSED", {
              currentState,
              initialPhase: isInitialIcePhase(),
            });
            if (!canInterruptInitialIce()) return;
            transitionRTCState("RECONNECTING", { iceState: currentState });
            await restartIceClean();
          }, graceMs);
          break;
        }

        case "failed":
          logWebRTC("ICE_FAILED", { elapsedMs, initialPhase: isInitialIcePhase() });
          if (!canInterruptInitialIce()) {
            setIsReconnecting(true);
            break;
          }
          transitionRTCState("RECONNECTING", { iceState: state });
          setCallErrorMessage("Connection interrupted. Recovering...");
          if (disconnectTimerRef.current) { clearTimeout(disconnectTimerRef.current); disconnectTimerRef.current = null; }
          restartIceClean();
          break;

        case "closed":
          transitionRTCState("IDLE", { iceState: state });
          logWebRTC("ICE_CLOSED", { elapsedMs });
          break;

        default:
          break;
      }
    };

    // ── Overall connection state / DTLS (Phase 5) ──
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      const prev = lastConnectionStateRef.current;
      lastConnectionStateRef.current = state;
      const elapsedMs = Date.now() - connectionStartTimeRef.current;
      timelineLog("CONNECTION_STATE_CHANGED", { from: prev, to: state, elapsedMs });
      logWebRTC("CONNECTION_STATE", { state, from: prev, elapsedMs });
      setDebugConnectionState(state);

      if (state === "connected") {
        logWebRTC("DTLS_CONNECTED", { elapsedMs });
        if (P2P_ONLY_MODE) {
          logWebRTC("P2P_CONNECTION_SUCCESSFUL", { callId: callIdRef.current, elapsedMs });
        } else if (!turnFallbackOccurredRef.current) {
          logWebRTC("P2P_ROUTE_SUCCESSFUL", { callId: callIdRef.current, elapsedMs, mode: CONNECTION_MODE });
        } else {
          logWebRTC("RELAY_ROUTE_SUCCESSFUL", { callId: callIdRef.current, elapsedMs, mode: CONNECTION_MODE });
        }
        setIsReconnecting(false);
        recoveryAttemptsRef.current = 0;
        // Immediately capture DTLS stats once connected
        logTransportStats();
      }
      if (state === "failed") {
        logWebRTC("DTLS_FAILED", { elapsedMs, initialPhase: isInitialIcePhase() });
        if (!canInterruptInitialIce()) return;
        transitionRTCState("RECONNECTING", { connectionState: state });
        setCallErrorMessage("Connection failed. Recovering...");
        restartIceClean();
      }
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 3+10 — Trickle ICE handler
  // SEND IMMEDIATELY on every candidate — NO queueing, NO batching.
  // logWebRTC("ICE_CANDIDATE_LOCAL_SENT") is the audit trail.
  // ───────────────────────────────────────────────────────────────────────────
  const setupIceCandidateHandler = (pc) => {
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const serialized = serializeIceCandidate(event.candidate);
        if (!serialized?.candidate?.startsWith("candidate:")) {
          logWebRTC("ICE_CANDIDATE_LOCAL_IGNORED", { reason: "malformed_local_candidate" });
          return;
        }
        const { type, family } = trackCandidateTelemetry(event.candidate.candidate, "local");
        timelineBump("localCandidatesGenerated");
        timelineLog("LOCAL_CANDIDATE_GENERATED", { type, family });
        logWebRTC("ICE_CANDIDATE_LOCAL_SENT", {
          type: type || "unknown",
          family,
          candidate: event.candidate.candidate?.substring(0, 80),
          sdpMid: event.candidate.sdpMid,
          totalSent: (candidateCountsRef.current.host || 0) +
            (candidateCountsRef.current.srflx || 0) +
            (candidateCountsRef.current.relay || 0),
          families: { ...localCandidateFamiliesRef.current },
        });
        timelineBump("localCandidatesSent");
        timelineLog("LOCAL_CANDIDATE_SENT", { type, family });
        sendSignaling({ action: "ice_candidate", candidate: serialized });
      } else {
        logWebRTC("ICE_GATHERING_NULL_CANDIDATE", {
          meaning: "local gathering complete",
          breakdown: { ...candidateCountsRef.current },
          families: { ...localCandidateFamiliesRef.current },
        });
        iceGatheringEndTimeRef.current = iceGatheringEndTimeRef.current || Date.now();
        timelineLog("REMOTE_CANDIDATE_END", { direction: "local_gathering_complete" });
        sendSignaling({ action: "ice_candidate", candidate: null });
      }
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 6 — Remote track handling (BLACK SCREEN ROOT CAUSE FIX)
  // BUG: old code only set srcObject when isNewStream===true.
  // FIX: re-assign srcObject on EVERY track so the video element is always wired,
  //      regardless of arrival order (audio-first vs video-first).
  // ───────────────────────────────────────────────────────────────────────────
  const setupTrackHandler = (pc) => {
    // Always attach incoming tracks to remoteVideoRef.
    //
    // ROOT CAUSE FIX: Never rely solely on event.streams[0].
    // When simulcast sendEncodings (rid) is used on the sender side, some
    // browser versions deliver ontrack with event.streams = [] even though
    // the track is fully decoded. Symptoms: WebRTC internals show
    // inbound-rtp with frameHeight>0, but video element srcObject is never
    // set → one-sided black screen.
    //
    // Fix: maintain a persistent remoteStreamRef. On every ontrack event,
    // add the arriving track to that stream (idempotent), then always wire
    // remoteVideoRef.srcObject to it — regardless of event.streams.
    pc.ontrack = (event) => {
      const eventStream = event.streams && event.streams[0];

      // Record first media arrival for diagnostics
      if (firstMediaReceivedTimeRef.current === 0) {
        firstMediaReceivedTimeRef.current = Date.now();
        logWebRTC("FIRST_MEDIA_RECEIVED", {
          kind: event.track?.kind,
          elapsedMs: Date.now() - callStartTimeRef.current,
        });
      }

      // Always ensure we have a persistent remote stream object
      if (!remoteStreamRef.current) {
        remoteStreamRef.current = new MediaStream();
      }

      // If this track is not already in our stream, add it
      const remoteStream = remoteStreamRef.current;
      let trackAdded = false;
      if (event.track && !remoteStream.getTracks().find(t => t.id === event.track.id)) {
        remoteStream.addTrack(event.track);
        trackAdded = true;
      }

      logWebRTC("REMOTE_TRACK_EVENT", {
        streams: !!eventStream,
        streamId: eventStream?.id || remoteStream.id,
        kind: event.track?.kind,
        fallback: !eventStream,
        totalTracks: remoteStream.getTracks().length,
        trackEnabled: event.track?.enabled,
        trackReadyState: event.track?.readyState,
      });

      // Update debug status when video track arrives
      if (event.track?.kind === "video") {
        setRemoteTrackStatus("Video track received");
        logWebRTC("REMOTE_VIDEO_TRACK_ARRIVED", {
          id: event.track.id,
          readyState: event.track.readyState,
          enabled: event.track.enabled,
        });
      }

      const video = remoteVideoRef.current;
      if (video) {
        // Wire srcObject — force re-assign if a new track was added to the stream
        if (video.srcObject !== remoteStream || trackAdded) {
          video.srcObject = remoteStream;
          video.autoplay = true;
          video.playsInline = true;
        }
        video.play().catch((err) => {
          logWebRTC("VIDEO_PLAY_FAILED", { error: err?.message });
        });

        // Rendering diagnostics 800ms after each track arrives
        setTimeout(async () => {
          if (!pcRef.current) return;
          try {
            const stats = await pcRef.current.getStats();
            let inboundVideo = null;
            stats.forEach((report) => {
              if (report.type === "inbound-rtp" && report.kind === "video") {
                inboundVideo = report;
              }
            });
            logWebRTC("INBOUND_VIDEO_STATS", {
              srcObjectSet: !!video.srcObject,
              readyState: video.readyState,
              videoWidth: video.videoWidth,
              videoHeight: video.videoHeight,
              trackCount: remoteStream.getTracks().length,
              inboundVideo: inboundVideo ? {
                framesDecoded: inboundVideo.framesDecoded || inboundVideo.framesReceived || 0,
                packetsLost: inboundVideo.packetsLost || 0,
                jitter: inboundVideo.jitter || null,
              } : null,
            });
          } catch (err) {
            log.error("getStats after ontrack failed:", err);
          }
        }, 800);
      }

      const audio = remoteAudioRef.current;
      if (audio) {
        if (audio.srcObject !== remoteStream || trackAdded) {
          audio.srcObject = remoteStream;
          audio.autoplay = true;
          audio.playsInline = true;
        }
        audio.play().catch(() => { });
      }
    };
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Signaling queue & handlers
  // ───────────────────────────────────────────────────────────────────────────
  const flushIceCandidates = async () => {
    if (!pcRef.current) return;
    if (!pcRef.current.remoteDescription) return;
    const queue = [...pendingIceCandidates.current];
    pendingIceCandidates.current = [];
    trace("ICE", "candidate queue flush", { count: queue.length });
    logWebRTC("ICE_CANDIDATE_DRAIN_START", { count: queue.length });
    for (const cand of queue) {
      try {
        const type = parseCandidateType(cand.candidate);
        logWebRTC("ICE_CANDIDATE_REMOTE_APPLIED", {
          type: type || "unknown",
          candidate: cand.candidate?.substring(0, 80),
          sdpMid: cand.sdpMid,
          drained: true,
        });
        await pcRef.current.addIceCandidate(new RTCIceCandidate(cand));
      } catch (err) {
        log.error("Error adding queued candidate:", err);
      }
    }
  };

  const handleSignalingMessage = async (msg) => {
    const type = msg.type || msg.action;
    if (!pcRef.current) {
      // PC not yet initialised (callee receives offer before setupWebRTCPeer runs).
      // Queue the message so it is replayed once the PC is ready, instead of dropping it.
      if (type === "offer" || type === "answer" || type === "ice_candidate") {
        log.warn(`handleSignalingMessage: pcRef null, re-queuing "${type}" for later replay.`);
        signalingQueueRef.current.push(msg);
      } else {
        log.warn(`Cannot handle signaling "${type}": pcRef is null`);
      }
      return;
    }
    switch (type) {
      case "offer":
        await runPeerOperation("handleRemoteOffer", async () => {
          timelineBump("offersReceived");
          timelineLog("OFFER_RECEIVED");
          logWebRTC("SDP_OFFER_RECEIVED", { sdpType: "offer", callId: callIdRef.current });
          const pc = pcRef.current;
          const iceRestartOffer = isIceRestartSdp(msg.sdp, pc);

          if (isInitialIcePhase()) {
            if (initialNegotiationCompleteRef.current) {
              timelineBump("offersIgnored", { reason: "initial_ice_patience_window" });
              timelineLog("OFFER_IGNORED", { reason: "initial_ice_patience_window", iceRestart: iceRestartOffer });
              logWebRTC("SDP_OFFER_IGNORED", {
                reason: "initial_ice_patience_window",
                iceRestart: iceRestartOffer,
                note: "Only one Offer/Answer allowed during first 60s — extra offers reset ICE to new",
              });
              return;
            }
          } else if (initialNegotiationCompleteRef.current && !iceRestartOffer) {
            timelineBump("offersIgnored", { reason: "initial_negotiation_already_complete" });
            timelineLog("OFFER_IGNORED", { reason: "initial_negotiation_already_complete" });
            logWebRTC("SDP_OFFER_IGNORED", { reason: "initial_negotiation_already_complete" });
            return;
          }
          if (isInitiatorRef.current) {
            logWebRTC("SDP_OFFER_IGNORED", { reason: "initiator_never_handles_remote_offers" });
            return;
          }
          if (isNegotiatingRef.current) {
            logWebRTC("SDP_OFFER_IGNORED", { reason: "negotiation_already_in_progress" });
            return;
          }

          const sdpKey = remoteSdpKey("offer", msg.sdp);
          if (appliedRemoteSdpKeysRef.current.has(sdpKey)) {
            logWebRTC("SDP_OFFER_IGNORED", { reason: "duplicate_remote_offer" });
            return;
          }

          if (iceRestartOffer && pc.signalingState === "stable") {
            try {
              await pc.setLocalDescription({ type: "rollback" });
              logWebRTC("SDP_LOCAL_ROLLBACK", { reason: "ice_restart_offer" });
            } catch (rollbackErr) {
              log.warn("Rollback before ICE restart offer failed:", rollbackErr);
            }
          } else if (pc.signalingState !== "stable" && pc.signalingState !== "have-remote-offer") {
            logWebRTC("SDP_OFFER_IGNORED", {
              reason: "unexpected_signaling_state",
              signalingState: pc.signalingState,
            });
            return;
          }

          isNegotiatingRef.current = true;
          remoteDescriptionAppliedRef.current = false;
          transitionRTCState("PREPARING_MEDIA", { remoteSdp: "offer", iceRestart: iceRestartOffer });
          timelineLog("SET_REMOTE_DESCRIPTION_OFFER", { iceRestart: iceRestartOffer });
          await pc.setRemoteDescription(
            new RTCSessionDescription({ type: "offer", sdp: msg.sdp })
          );
          appliedRemoteSdpKeysRef.current.add(sdpKey);
          logWebRTC("SDP_REMOTE_DESC_SET", { sdpType: "offer", iceRestart: iceRestartOffer });
          remoteDescriptionAppliedRef.current = true;
          await flushIceCandidates();

          // ── CALLEE VIDEO FIX (v2) ────────────────────────────────────────────
          // Do NOT use SDP text parsing — SDP uses CRLF (\r\n) which makes
          // line.startsWith() unreliable. Chrome also omits 'a=sendrecv' (it is
          // the implicit default), so a video section with no direction attribute
          // would be wrongly detected as inactive.
          //
          // RELIABLE APPROACH: After setRemoteDescription the browser has already
          // parsed the SDP and populated each transceiver's receiver.track. Iterate
          // transceivers directly — any transceiver that has a receiver video track
          // means the remote is offering video. Force direction = sendrecv so our
          // answer does not kill video.
          if (!iceRestartOffer) {
            const transceivers = pc.getTransceivers();
            let forcedSendrecvCount = 0;
            for (const t of transceivers) {
              if (t.direction === "stopped") continue;
              const kind = t.receiver?.track?.kind;
              // Force sendrecv for both audio and video so the answer is correct.
              // Tracks will be attached by the post-answer syncSendersWithTracks call.
              if ((kind === "video" || kind === "audio") && t.direction !== "sendrecv") {
                t.direction = "sendrecv";
                forcedSendrecvCount++;
                logWebRTC("TRANSCEIVER_DIRECTION_FORCED", { kind, mid: t.mid, wasDirection: t.direction });
              }
            }
            logWebRTC("CALLEE_TRANSCEIVER_PROBE", {
              transceiverCount: transceivers.length,
              forcedSendrecvCount,
              callType: callTypeRef.current,
              localStreamHasVideo: !!(localStreamRef.current?.getVideoTracks()[0]),
              transceiverKinds: transceivers
                .filter(t => t.direction !== "stopped")
                .map(t => ({ kind: t.receiver?.track?.kind, dir: t.direction, mid: t.mid })),
            });
          }
          // ── END CALLEE VIDEO FIX (v2) ────────────────────────────────────────

          timelineLog("CREATE_ANSWER", { iceRestart: iceRestartOffer });
          const answer = await pc.createAnswer();
          timelineBump("answersCreated", { iceRestart: iceRestartOffer });
          logWebRTC("SDP_ANSWER_CREATED", { sdpType: "answer", iceRestart: iceRestartOffer });
          timelineLog("SET_LOCAL_DESCRIPTION_ANSWER", { iceRestart: iceRestartOffer });
          await pc.setLocalDescription(answer);
          logWebRTC("SDP_LOCAL_DESC_SET", { sdpType: "answer" });
          sendSignaling({ action: "answer", sdp: answer.sdp });
          timelineBump("answersSent", { iceRestart: iceRestartOffer });
          timelineLog("ANSWER_SENT", { iceRestart: iceRestartOffer });
          logWebRTC("SDP_ANSWER_SENT", { iceRestart: iceRestartOffer });

          // Post-answer: attach local tracks to senders now that React state
          // has had time to flush (callTypeRef is authoritative by this point).
          // Scheduling via setTimeout(0) ensures we don't block the answer path.
          if (!iceRestartOffer) {
            setTimeout(async () => {
              if (pcRef.current && localStreamRef.current) {
                try {
                  await syncSendersWithTracks(pcRef.current);
                  logWebRTC("POST_ANSWER_SYNC_SENDERS_DONE", { callType: callTypeRef.current });
                } catch (syncErr) {
                  log.warn("Post-answer syncSendersWithTracks failed:", syncErr);
                }
              }
            }, 0);
          }

          if (!iceRestartOffer) {
            markNegotiationComplete();
          }
          isNegotiatingRef.current = false;
        }).catch((err) => {
          isNegotiatingRef.current = false;
          log.error("Error handling offer:", err);
        });
        break;

      case "answer":
        await runPeerOperation("handleRemoteAnswer", async () => {
          timelineBump("answersReceived");
          timelineLog("ANSWER_RECEIVED");
          if (pcRef.current.signalingState !== "have-local-offer") {
            logWebRTC("SDP_ANSWER_IGNORED", {
              reason: "no_local_offer",
              signalingState: pcRef.current.signalingState,
            });
            return;
          }
          const sdpKey = remoteSdpKey("answer", msg.sdp);
          if (appliedRemoteSdpKeysRef.current.has(sdpKey)) {
            logWebRTC("SDP_ANSWER_IGNORED", { reason: "duplicate_remote_answer" });
            return;
          }
          logWebRTC("SDP_ANSWER_RECEIVED", {
            offerToAnswerMs: Date.now() - offerCreatedTimeRef.current,
          });
          isNegotiatingRef.current = true;
          answerReceivedTimeRef.current = Date.now();
          remoteDescriptionAppliedRef.current = false;
          timelineLog("SET_REMOTE_DESCRIPTION_ANSWER");
          await pcRef.current.setRemoteDescription(
            new RTCSessionDescription({ type: "answer", sdp: msg.sdp })
          );
          appliedRemoteSdpKeysRef.current.add(sdpKey);
          logWebRTC("SDP_REMOTE_DESC_SET", { sdpType: "answer" });
          remoteDescriptionAppliedRef.current = true;
          await flushIceCandidates();
          transitionRTCState("STABLE", { remoteSdp: "answer" });
          markNegotiationComplete();
          isNegotiatingRef.current = false;
        }).catch((err) => {
          isNegotiatingRef.current = false;
          log.error("Error handling answer:", err);
        });
        break;

      case "ice_candidate":
        if (msg.candidate) {
          const candStr = msg.candidate.candidate;
          if (!candStr || typeof candStr !== "string" || !candStr.startsWith("candidate:")) {
            logWebRTC("ICE_CANDIDATE_REMOTE_IGNORED", { reason: "malformed_candidate_string" });
            break;
          }
          const candidateKey = [
            candStr,
            msg.candidate.sdpMid ?? "",
            msg.candidate.sdpMLineIndex ?? "",
            msg.candidate.usernameFragment ?? "",
          ].join("|");
          if (processedRemoteCandidatesRef.current.has(candidateKey)) {
            log.ice("Ignoring duplicate remote candidate.");
            break;
          }
          processedRemoteCandidatesRef.current.add(candidateKey);

          const { type, family } = trackCandidateTelemetry(candStr, "remote");
          timelineBump("remoteCandidatesReceived");
          timelineLog("REMOTE_CANDIDATE_RECEIVED", { type, family });

          if (pcRef.current && remoteDescriptionAppliedRef.current) {
            try {
              trace("ICE", "candidate applied", { type: type || "unknown", family, sdpMid: msg.candidate.sdpMid });
              timelineLog("addIceCandidate()");
              logWebRTC("ICE_CANDIDATE_REMOTE_APPLIED", {
                type: type || "unknown",
                family,
                candidate: candStr.substring(0, 80),
                sdpMid: msg.candidate.sdpMid,
                drained: false,
                families: { ...remoteCandidateFamiliesRef.current },
              });
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
              timelineBump("remoteCandidatesApplied");
            } catch (err) {
              timelineBump("remoteCandidatesFailed");
              log.error("addIceCandidate failed:", err);
            }
          } else {
            trace("ICE", "candidate queued", { type: type || "unknown", sdpMid: msg.candidate.sdpMid });
            timelineBump("remoteCandidatesQueued");
            logWebRTC("ICE_CANDIDATE_REMOTE_QUEUED", {
              type: type || "unknown",
              family,
              candidate: candStr.substring(0, 80),
              sdpMid: msg.candidate.sdpMid,
            });
            pendingIceCandidates.current.push(msg.candidate);
          }
        } else {
          timelineLog("REMOTE_CANDIDATE_END", { direction: "remote" });
          logWebRTC("ICE_CANDIDATE_REMOTE_NULL", { meaning: "remote end-of-candidates" });
        }
        break;

      default:
        break;
    }
  };

  const enqueueSignalingMessage = (msg) => {
    log.signaling(`Enqueue: ${msg.type || msg.action}`);
    signalingQueueRef.current.push(msg);
    processSignalingQueue();
  };

  const processSignalingQueue = async () => {
    if (isProcessingQueueRef.current || !pcRef.current || !webrtcPeerReadyRef.current) return;
    isProcessingQueueRef.current = true;
    while (signalingQueueRef.current.length > 0 && pcRef.current) {
      const msg = signalingQueueRef.current.shift();
      try { await handleSignalingMessage(msg); }
      catch (err) { log.error("Queue processing error:", err); }
    }
    isProcessingQueueRef.current = false;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // WebSocket signaling
  // ───────────────────────────────────────────────────────────────────────────
  async function handleSocketMessage(e) {
    const msg = JSON.parse(e.data);
    const type = msg.type || msg.action;

    switch (type) {
      case "call.incoming":
        if (callStateRef.current !== "idle") {
          log.warn("Ignoring incoming call. State is not idle:", callStateRef.current);
          break;
        }
        setCallId(msg.call_id);
        callIdRef.current = msg.call_id;
        calleeIdRef.current = msg.caller_id || "";
        resetCallTimeline(msg.call_id);
        // FIX 1: Write call_type directly into callTypeRef so setupWebRTCPeer
        // always reads the correct type regardless of React render timing.
        // React state (setCallType) is async; callTypeRef.current must be
        // authoritative before the useEffect([callState]) fires.
        // Normalize callType to lowercase to match expectations ("video", "blind_date", "voice")
        const callTypeLower = (msg.call_type || "").toLowerCase();
        callTypeRef.current = callTypeLower;
        setCallType(callTypeLower);
        setCallerEmail(msg.caller_email || "Someone");
        setCallState("incoming");
        break;
      case "call.accepted":
        if (msg.call_id) {
          setCallId(msg.call_id);
          callIdRef.current = msg.call_id;
          if (!callTimelineRef.current.callId) resetCallTimeline(msg.call_id);
        }
        setIsAccepting(false);
        setCallState("active");
        setIsMediaConnected(false);
        break;
      case "call.connected":
        setIsMediaConnected(true);
        setDuration(0);
        break;
      case "quota_warning":
        setQuotaWarning({
          remainingSeconds: msg.remaining_seconds,
          remainingMinutes: msg.remaining_minutes,
          message: msg.message,
        });
        break;
      case "signaling_rejected":
        logWebRTC("SIGNALING_REJECTED", { action: msg.action, reason: msg.reason });
        break;
      case "ice_restart_approved":
        coordinatedRestartApprovedRef.current = true;
        if (isInitiatorRef.current) {
          sendIceRestartOffer("coordinated_restart").catch(() => { });
        }
        break;
      case "ice_restart_pending":
        logWebRTC("ICE_RESTART_PENDING", { votes: msg.restart_votes });
        break;
      case "offer":
      case "answer":
      case "ice_candidate":
        enqueueSignalingMessage(msg);
        break;
      case "camera_request":
        alert("The other user requested you to turn your camera on!");
        break;
      case "camera_unlocked":
        setCameraUnlocked(true);
        alert("📸 5 minutes reached! Cameras are now unlocked for your Blind Date!");
        break;
      case "chat_saved":
        setChatSaved(true);
        alert("🎉 Match saved! Both users voted to keep contact.");
        break;
      case "call.ended":
        setIsAccepting(false);
        cleanupCall();
        setTimeout(() => alert(`Call ended. Reason: ${msg.reason || "disconnect"}. Duration: ${msg.duration || 0}s`), 100);
        break;
      case "error":
        setIsAccepting(false);
        cleanupCall();
        setTimeout(() => alert(`Calling Error: ${msg.message}`), 100);
        break;
      default:
        break;
    }
  }

  // Keep handlers stable in closures
  useEffect(() => {
    handleSocketMessageRef.current = handleSocketMessage;
    cleanupCallRef.current = cleanupCall;
  });

  // ───────────────────────────────────────────────────────────────────────────
  // WebSocket connection with reconnect logic
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let heartbeatInterval = null;
    let reconnectAttempts = 0;

    const connect = async () => {
      if (ws) { try { ws.onclose = null; ws.close(); } catch { } }
      try {
        const res = await authAPI.getWsTicket();
        if (!res || !res.ticket) throw new Error("No WS ticket");

        ws = new WebSocket(wsURL.call(res.ticket));

        ws.onopen = () => {
          reconnectAttempts = 0;
          log.signaling("WebSocket connected.");
          if (callStateRef.current !== "idle" && callIdRef.current) {
            ws.send(JSON.stringify({
              action: "reconnect_sync",
              call_id: callIdRef.current,
              call_state: callStateRef.current,
            }));
            const iceState = pcRef.current?.iceConnectionState;
            if (iceState === "connected" || iceState === "completed") {
              mediaConnectedSentRef.current = false;
              notifyMediaConnected();
            }
          }
          flushOutgoingSignalingQueue();
        };

        ws.onmessage = (e) => handleSocketMessageRef.current(e);
        ws.onclose = () => scheduleReconnect();
        ws.onerror = (err) => { log.error("WS error:", err); ws.close(); };

        socketRef.current = ws;

        if (heartbeatInterval) clearInterval(heartbeatInterval);
        heartbeatInterval = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ action: "heartbeat" }));
          }
        }, 2000);
      } catch (err) {
        log.error("WS connection failed:", err.message || err);
        cleanupCallRef.current();
        scheduleReconnect();
      }
    };

    const scheduleReconnect = () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts), 30000);
      reconnectAttempts++;
      log.signaling(`WS reconnect in ${delay / 1000}s (attempt ${reconnectAttempts})`);
      reconnectTimeout = setTimeout(connect, delay);
    };

    connect();

    return () => {
      cleanupCallRef.current();
      if (ws) { ws.onclose = null; ws.close(); }
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (heartbeatInterval) clearInterval(heartbeatInterval);
    };
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Expose global window hooks for external call triggers
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    window.startCall = (targetUserId, type = "voice") => initiateCall(targetUserId, type);
    window.startBlindDateCall = (sessionId, otherUserId) => joinBlindDateCall(sessionId, otherUserId);
    return () => { window.startCall = null; window.startBlindDateCall = null; };
  }, [user]);

  // Duration timer — only counts connected talktime, not ringing
  useEffect(() => {
    if (callState === "active" && isMediaConnected) {
      timerRef.current = setInterval(() => setDuration(d => d + 1), 1000);
    } else {
      clearInterval(timerRef.current);
    }
    return () => clearInterval(timerRef.current);
  }, [callState, isMediaConnected]);

  // Trigger WebRTC setup when active.
  // CRITICAL: force-sync callTypeRef.current BEFORE setupWebRTCPeer reads it.
  // Without this, the useEffect that syncs callTypeRef (line 60) may not have
  // flushed yet when setupWebRTCPeer runs, causing the video transceiver to be
  // created with direction="inactive" even for video calls — ICE/DTLS succeed
  // but ontrack never fires because the m=video line is negotiated as inactive.
  //
  // Guard: webrtcSetupRunningRef prevents re-invoking setupWebRTCPeer when callType
  // is in the dep array. Without it, any re-render with callState==="active" and a
  // changed callType (e.g. from a race on first render) would destroy the live PC.
  useEffect(() => {
    if (callState !== "active") {
      webrtcSetupRunningRef.current = false;
      return;
    }

    callTypeRef.current = callType;
    if (webrtcSetupRunningRef.current) return;

    webrtcSetupRunningRef.current = true;
    const generation = ++webrtcSetupGenerationRef.current;

    setupWebRTCPeer(isInitiatorRef.current, generation).finally(() => {
      if (webrtcSetupGenerationRef.current === generation) {
        webrtcSetupRunningRef.current = false;
      }
    });

    return () => {
      if (callStateRef.current !== "active") {
        webrtcSetupGenerationRef.current += 1;
      }
    };
  }, [callState]);





  useEffect(() => {
    if (callState !== "active") return;
    
    // Aggressive rewiring interval to guarantee srcObject is set
    // even if React delays rendering the video element or re-renders it.
    const interval = setInterval(() => {
      if (!remoteStreamRef.current) return;
      const stream = remoteStreamRef.current;
      const vid = remoteVideoRef.current;
      const aud = remoteAudioRef.current;

      if (vid && vid.srcObject !== stream) {
        vid.srcObject = stream;
        vid.play().catch(() => { });
        log.webrtc("Aggressive rewire: remoteVideoRef.srcObject set");
      }
      if (aud && aud.srcObject !== stream) {
        aud.srcObject = stream;
        aud.play().catch(() => { });
        log.webrtc("Aggressive rewire: remoteAudioRef.srcObject set");
      }
      // Gate on stream having video tracks — NOT callTypeRef, which can be stale.
      const localHasVideo = (localStreamRef.current?.getVideoTracks().length ?? 0) > 0;
      if (localVideoRef.current && localStreamRef.current && localHasVideo) {
        if (localVideoRef.current.srcObject !== localStreamRef.current) {
          localVideoRef.current.srcObject = localStreamRef.current;
          log.webrtc("Aggressive rewire: localVideoRef.srcObject set");
        }
        localVideoRef.current.play().catch(() => { });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [callState]);





  // Notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // ───────────────────────────────────────────────────────────────────────────
  // Ringtone (Web Audio API)
  // ───────────────────────────────────────────────────────────────────────────
  const startRingtone = () => {
    if (ringtoneRef.current) return;
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const audioCtx = new AudioContextClass();
      const playPattern = () => {
        const [o1, o2] = [audioCtx.createOscillator(), audioCtx.createOscillator()];
        const gain = audioCtx.createGain();
        o1.frequency.value = 440; o2.frequency.value = 480;
        o1.connect(gain); o2.connect(gain); gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime + 1.5);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.8);
        o1.start(); o2.start();
        setTimeout(() => { try { o1.stop(); o2.stop(); o1.disconnect(); o2.disconnect(); gain.disconnect(); } catch { } }, 2000);
      };
      playPattern();
      const interval = setInterval(playPattern, 4000);
      ringtoneRef.current = { audioCtx, interval };
    } catch (err) { log.error("Ringtone failed:", err); }
  };

  const stopRingtone = () => {
    if (ringtoneRef.current) {
      clearInterval(ringtoneRef.current.interval);
      try { ringtoneRef.current.audioCtx.close(); } catch { }
      ringtoneRef.current = null;
    }
  };

  useEffect(() => {
    if (callState === "incoming") {
      startRingtone();
      if ("Notification" in window && Notification.permission === "granted") {
        new Notification("Incoming Call", {
          body: `${callerEmail.split("@")[0]} is calling you!`,
          tag: "incoming-call",
          requireInteraction: true,
        });
      }
    } else {
      stopRingtone();
    }
    return () => stopRingtone();
  }, [callState, callerEmail]);

  // ───────────────────────────────────────────────────────────────────────────
  // Main WebRTC setup
  // Phase 2 — RTCPeerConnection config
  // Phase 1 — STUN-only P2P first; 60s patience before any recovery interrupt
  // ───────────────────────────────────────────────────────────────────────────
  const setupWebRTCPeer = async (isInitiator, generation) => {
    const isStale = () => generation !== webrtcSetupGenerationRef.current
      || callStateRef.current !== "active";

    auditAction("setupWebRTCPeer", isInitiator ? "caller" : "callee", { generation });

    webrtcPeerReadyRef.current = false;
    if (!callTimelineRef.current.callId || callTimelineRef.current.callId !== callIdRef.current) {
      resetCallTimeline(callIdRef.current);
    }
    closePeerConnection("setupWebRTCPeer_restart");

    // Full state reset (DO NOT clear signalingQueueRef.current here)
    pendingIceCandidates.current = [];
    processedRemoteCandidatesRef.current.clear();
    appliedRemoteSdpKeysRef.current.clear();
    isProcessingQueueRef.current = false;
    isNegotiatingRef.current = false;
    negotiationQueuedRef.current = false;
    initialNegotiationStartedRef.current = false;
    initialNegotiationCompleteRef.current = false;
    initialIcePhaseExpiredRef.current = false;
    iceRestartInFlightRef.current = false;
    negotiationChainRef.current = Promise.resolve();
    transceiversRef.current = { audio: null, video: null };
    dataChannelRef.current = null;
    remoteDescriptionAppliedRef.current = false;
    turnFallbackOccurredRef.current = false;
    turnEscalatedRef.current = false;
    recoveryAttemptsRef.current = 0;
    isRecoveringRef.current = false;
    metricsSubmittedRef.current = false;
    remoteStreamRef.current = null;
    
    transitionRTCState("CONNECTING");

    // Phase 4 — timestamp init
    callStartTimeRef.current = Date.now();
    offerCreatedTimeRef.current = 0;
    answerReceivedTimeRef.current = 0;
    iceConnectedTimeRef.current = 0;
    firstMediaReceivedTimeRef.current = 0;
    iceGatheringStartTimeRef.current = 0;
    iceGatheringEndTimeRef.current = 0;
    connectionStartTimeRef.current = Date.now();
    connectionEndTimeRef.current = 0;

    // Quality telemetry reset
    candidateCountsRef.current = { host: 0, srflx: 0, relay: 0 };
    localCandidateFamiliesRef.current = { ipv4: 0, ipv6: 0 };
    remoteCandidateFamiliesRef.current = { ipv4: 0, ipv6: 0 };
    localCandidateTypesRef.current = {};
    remoteCandidateTypesRef.current = {};
    selectedCandidatePairRef.current = null;
    rttHistoryRef.current = [];
    rttAverageRef.current = 0;
    maxRttRef.current = 0;
    lossAverageRef.current = 0;
    maxPacketLossRef.current = 0;
    jitterAverageRef.current = 0;
    bitrateHistoryRef.current = [];
    lastStatsRef.current = null;
    currentBitrateRef.current = 600 * 1000;
    lastIceRestartTimeRef.current = 0;

    setIsReconnecting(false);

    try {
      const cachedProbe = getCachedCandidates();
      if (cachedProbe) {
        logWebRTC("CANDIDATE_CACHE_HIT", { ageMs: Date.now() - cachedProbe.timestamp });
      }

      let iceServers = [...DEFAULT_STUN_SERVERS];
      try {
        const res = await callAPI.getIceServers(false, P2P_ONLY_MODE);
        if (res?.iceServers?.length) {
          const mapped = mapIceServersFromApi(res.iceServers);
          iceServers = P2P_ONLY_MODE
            ? [...DEFAULT_STUN_SERVERS, ...filterStunOnlyIceServers(mapped)]
            : mapped;
        }
        if (res?.iceCandidatePoolSize) {
          iceCandidatePoolSizeRef.current = res.iceCandidatePoolSize;
        }
        if (res?.ipv6_available) {
          localIpv6AvailableRef.current = true;
        }
        logWebRTC("ICE_SERVERS_LOADED", {
          serverCount: iceServers.length,
          ipv6_available: Boolean(res?.ipv6_available),
          prefer_ipv6: preferIpv6Ref.current || Boolean(res?.prefer_ipv6),
        });
      } catch (err) {
        log.error(`Failed to fetch ICE servers (mode=${CONNECTION_MODE}), using defaults:`, err);
      }

      if (isStale()) return;

      const configuration = buildRtcConfiguration(iceServers);
      const turnCount = configuration.iceServers.filter((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => typeof u === "string" && (u.startsWith("turn:") || u.startsWith("turns:")));
      }).length;
      if (CONNECTION_MODE === "hybrid" && turnCount > 0) {
        turnEscalatedRef.current = true;
      }
      log.ice(
        CONNECTION_MODE === "hybrid"
          ? `Hybrid RTCPeerConnection (STUN+TURN upfront, P2P preferred, pool=${ICE_CANDIDATE_POOL_SIZE}, turnEntries=${turnCount})`
          : `P2P-only RTCPeerConnection (STUN, pool=${ICE_CANDIDATE_POOL_SIZE}, no TURN)`
      );
      installTimelineGlobals();

      const pc = new RTCPeerConnection(configuration);
      if (isStale()) {
        pc.close();
        return;
      }

      pcInstanceIdRef.current += 1;
      timelineBump("pcCreated");
      timelineLog("PC_CREATED", {
        generation,
        mode: CONNECTION_MODE,
        iceServerCount: configuration.iceServers.length,
        turnEntryCount: turnCount,
        iceCandidatePoolSize: configuration.iceCandidatePoolSize,
        continualGathering: configuration.continualGatheringPolicy,
      });

      pcRef.current = pc;
      window.pc = pc;

      setupConnectionListeners(pc, isInitiator);
      setupIceCandidateHandler(pc);
      setupTrackHandler(pc);
      if (!isInitiator) setupDataChannel(pc, false);

      // Acquire local media if not already obtained
      const needsVideo = callTypeRef.current === "video" || callTypeRef.current === "blind_date";
      const hasVideoTrack = (localStreamRef.current?.getVideoTracks().length ?? 0) > 0;
      if (!localStreamRef.current || (needsVideo && !hasVideoTrack)) {
        try {
          if (localStreamRef.current) {
            localStreamRef.current.getTracks().forEach(t => t.stop());
            localStreamRef.current = null;
          }
          localStreamRef.current = await acquireLocalMedia(needsVideo);
          if (isStale()) return;
          log.webrtc(`Local media acquired (video=${needsVideo})`);
        } catch (mediaErr) {
          log.warn("acquireLocalMedia failed — using loopback placeholder:", mediaErr);
          // Safari-safe loopback placeholder
          const canvas = document.createElement("canvas");
          canvas.width = 320; canvas.height = 240;
          canvas.getContext("2d").fillRect(0, 0, 320, 240);
          const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
          const osc = audioCtx.createOscillator();
          const dest = osc.connect(audioCtx.createMediaStreamDestination());
          osc.start();
          localStreamRef.current = new MediaStream([
            ...canvas.captureStream(10).getVideoTracks(),
            ...dest.stream.getAudioTracks(),
          ]);
        }
      }

      // Use stream ground-truth (not callTypeRef) to decide whether to show local video.
      // callTypeRef.current can be stale on the callee when setupWebRTCPeer runs,
      // but localStreamRef always has the correct tracks from getUserMedia in acceptCall.
      const streamHasVideo = (localStreamRef.current?.getVideoTracks().length ?? 0) > 0;
      if (localVideoRef.current && (needsVideo || streamHasVideo)) {
        localVideoRef.current.srcObject = localStreamRef.current;
        localVideoRef.current.play().catch(() => {});
        logWebRTC("LOCAL_VIDEO_WIRED", { needsVideo, streamHasVideo, callType: callTypeRef.current });
      }

      // Attach tracks, transceivers, and data channel BEFORE creating any offer/answer (Caller only)
      if (localStreamRef.current && isInitiator) {
        await syncSendersWithTracks(pc);
        if (isStale()) return;
        setupDataChannel(pc, isInitiator);
        if (debug) console.log("[WEBRTC] Local transceivers, tracks, and data channel initialized.");
      }

      if (isInitiator) {
        await createAndSendOffer({}, "initial");
        if (isStale()) return;
      }

      if (isStale()) return;

      webrtcPeerReadyRef.current = true;
      await processSignalingQueue();
      startInitialIceMonitor();
    } catch (err) {
      log.error("setupWebRTCPeer fatal error:", err);
      if (generation === webrtcSetupGenerationRef.current) {
        closePeerConnection();
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 8 — Network change / sleep-wake recovery
  // ───────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (callState !== "active") return;

    const handleNetworkEvent = async (force = false) => {
      if (!pcRef.current) return;
      if (isInitialIcePhase()) {
        log.webrtc("Network event ignored during initial ICE phase.");
        return;
      }

      const iceState = pcRef.current.iceConnectionState;
      const connState = pcRef.current.connectionState;

      if (!force && !["failed", "disconnected"].includes(iceState) && !["failed", "disconnected"].includes(connState)) {
        log.webrtc("Network event — connection healthy, skipping restart.");
        return;
      }

      if (force && iceConnectedTimeRef.current === 0) return;

      log.restart(`Network event (force=${force}). States: ice=${iceState} conn=${connState}`);
      await restartIceClean();
    };

    // Detect sleep-wake: drift > 7s between 2s ticks
    let lastTick = Date.now();
    const driftInterval = setInterval(() => {
      const now = Date.now();
      if (now - lastTick > 7000) {
        log.restart("Sleep-wake detected (timer drift). Triggering recovery check.");
        handleNetworkEvent(true);
      }
      lastTick = now;
    }, 2000);

    const onOnline = () => handleNetworkEvent(false);
    const onOffline = () => handleNetworkEvent(false);
    const onConnChange = () => handleNetworkEvent(false);
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        log.webrtc("Tab visible. Verifying connection...");
        handleNetworkEvent(false);
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    if (navigator.connection) navigator.connection.addEventListener("change", onConnChange);

    return () => {
      clearInterval(driftInterval);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      document.removeEventListener("visibilitychange", onVisible);
      if (navigator.connection) navigator.connection.removeEventListener("change", onConnChange);
    };
  }, [callState]);

  // ───────────────────────────────────────────────────────────────────────────
  // Call initiation flows
  // ───────────────────────────────────────────────────────────────────────────
  const initiateCall = async (targetId, type) => {
    if (callStateRef.current !== "idle") {
      log.warn("Cannot initiate call, state is not idle:", callStateRef.current);
      return;
    }
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      alert("⚠️ Connection lost. Please wait while we reconnect.");
      return;
    }
    calleeIdRef.current = targetId;
    await loadCallIntelligence(targetId);
    const needsVideo = type === "video" || type === "blind_date";
    try {
      const stream = await acquireLocalMedia(needsVideo);
      localStreamRef.current = stream;
      isInitiatorRef.current = true;
      setCallType(type);
      setCallState("ringing");
      setChatSaved(false);
      setCameraUnlocked(false);
      sendSignaling({ action: "initiate", callee_id: targetId, call_type: type });
    } catch (err) {
      alert("⚠️ Camera/microphone access required. Check browser settings.");
      log.error("acquireLocalMedia failed on initiateCall:", err);
    }
  };

  const joinBlindDateCall = async (sessionId, otherUserId) => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      alert("⚠️ Connection lost. Cannot join Blind Date room.");
      return;
    }
    const myId = user?.id || "";
    isInitiatorRef.current = String(myId).toLowerCase() < String(otherUserId).toLowerCase();
    log.webrtc(`Blind Date room ${sessionId}. isInitiator=${isInitiatorRef.current}`);

    try {
      const stream = await acquireLocalMedia(true);
      localStreamRef.current = stream;
    } catch (err) {
      alert("⚠️ Camera/microphone access required for Blind Date.");
      log.error("acquireLocalMedia failed on joinBlindDateCall:", err);
      return;
    }
    setCallId(sessionId);
    callIdRef.current = sessionId;
    setCallType("blind_date");
    setChatSaved(false);
    setCameraUnlocked(false);
    setIsAccepting(true);
    sendSignaling({ action: "accept", call_id: sessionId });
  };

  const acceptCall = async () => {
    if (socketRef.current?.readyState !== WebSocket.OPEN) {
      alert("⚠️ Connection lost. Cannot accept call.");
      return;
    }
    const needsVideo =
      callTypeRef.current === "video" ||
      callTypeRef.current === "blind_date" ||
      callType === "video" ||
      callType === "blind_date";
    try {
      const stream = await acquireLocalMedia(needsVideo);
      localStreamRef.current = stream;
      isInitiatorRef.current = false;
      setIsAccepting(true);
      sendSignaling({ action: "accept", call_id: callId });
    } catch (err) {
      setIsAccepting(false);
      alert("⚠️ Camera/microphone access required to accept the call.");
      log.error("acquireLocalMedia failed on acceptCall:", err);
    }
  };

  const declineOrEndCall = () => {
    sendSignaling({ action: "end" });
    cleanupCall();
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Phase 9 — Full cleanup (memory-leak safe)
  // ───────────────────────────────────────────────────────────────────────────
  function cleanupCall() {
    log.webrtc("cleanupCall() — tearing down session.");
    if (typeof window !== "undefined" && window.dumpCallTimeline) {
      window.dumpCallTimeline();
    }

    // Submit metrics before destroying state
    runFailureClassification();
    submitCallMetrics();

    // Clear all timers
    clearAllTimers();
    stopStatsLoop();
    clearInterval(timerRef.current);

    // Clear signaling state
    webrtcPeerReadyRef.current = false;
    processedRemoteCandidatesRef.current.clear();
    appliedRemoteSdpKeysRef.current.clear();
    signalingQueueRef.current = [];
    isProcessingQueueRef.current = false;
    pendingIceCandidates.current = [];
    isNegotiatingRef.current = false;
    negotiationQueuedRef.current = false;
    initialNegotiationStartedRef.current = false;
    initialNegotiationCompleteRef.current = false;
    initialIcePhaseExpiredRef.current = false;
    iceRestartInFlightRef.current = false;
    transceiversRef.current = { audio: null, video: null };
    dataChannelRef.current = null;
    transitionRTCState("IDLE");

    // Clear recovery state
    isRecoveringRef.current = false;
    turnEscalatedRef.current = false;

    // Stop local media tracks
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
    }
    remoteStreamRef.current = null;

    // Detach DOM refs
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null;

    webrtcSetupGenerationRef.current += 1;
    webrtcSetupRunningRef.current = false;
    closePeerConnection();

    // Reset UI state
    setCallState("idle");
    setIsAccepting(false);
    setDuration(0);
    setIsMediaConnected(false);
    setQuotaWarning(null);
    mediaConnectedSentRef.current = false;
    setMuted(false);
    setCameraActive(true);
    setChatSaved(false);
    setCameraUnlocked(false);
    setIsReconnecting(false);
    setDebugIceState("new");
    setDebugConnectionState("new");
    setRemoteTrackStatus("Awaiting tracks...");
    setCallErrorMessage(null);

    stopRingtone();
    log.webrtc("cleanupCall() complete.");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Controls
  // ───────────────────────────────────────────────────────────────────────────
  const toggleMute = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getAudioTracks()[0];
      if (track) { track.enabled = !track.enabled; setMuted(!track.enabled); }
    }
  };

  const toggleCamera = () => {
    if (localStreamRef.current) {
      const track = localStreamRef.current.getVideoTracks()[0];
      if (track) {
        track.enabled = !track.enabled;
        setCameraActive(track.enabled);
        if (track.enabled) sendSignaling({ action: "camera_on" });
      }
    }
  };

  const saveChatVote = () => sendSignaling({ action: "save_chat" });

  const forcePlayAllVideos = () => {
    document.querySelectorAll("video").forEach(v => {
      v.play().then(() => log.webrtc("Force-play succeeded.")).catch(err => log.warn("Force-play failed:", err));
    });
  };

  const formatDuration = (secs) => {
    const m = Math.floor(secs / 60), s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Render
  // ───────────────────────────────────────────────────────────────────────────
  if (callState === "idle") return null;

  const isPreConnect = callState === "incoming" || callState === "ringing";

  return (
    <div
      className={isPreConnect ? `${callCss.overlay} ${callCss.overlayIncoming}` : undefined}
      style={!isPreConnect ? styles.overlayContainer : undefined}
    >
      <audio ref={remoteAudioRef} autoPlay playsInline style={{ display: "none" }} />

      {/* ── Incoming Call ── */}
      {callState === "incoming" && (
        <div className={callCss.incomingScreen}>
          <div className={callCss.incomingBody}>
            <div className={callCss.avatarWrap}>
              <div className={callCss.pulseRing} />
              <div className={callCss.avatar}>📞</div>
            </div>
            <h2 className={callCss.callerName}>{callerEmail.split("@")[0]}</h2>
            <p className={callCss.callTypeLabel}>
              {isAccepting ? "Connecting..." : `Incoming ${callType.replace("_", " ")} call`}
            </p>
          </div>
          <div className={callCss.incomingActions}>
            <div className={callCss.buttonRow}>
              <button type="button" className={`${callCss.callBtn} ${callCss.declineBtn}`} onClick={declineOrEndCall} disabled={isAccepting}>
                Decline
              </button>
              <button type="button" className={`${callCss.callBtn} ${callCss.acceptBtn}`} onClick={acceptCall} disabled={isAccepting}>
                {isAccepting ? "Connecting..." : "Accept"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Ringing / Outgoing ── */}
      {callState === "ringing" && (
        <div className={callCss.ringingScreen}>
          <div className={callCss.ringingBody}>
            <div className={callCss.avatarWrap}>
              <div className={callCss.pulseRing} />
              <div className={callCss.avatar}>🔊</div>
            </div>
            <h2 className={callCss.callerName}>Calling Partner...</h2>
            <p className={callCss.callTypeLabel}>Dialing {callType.replace("_", " ")}...</p>
          </div>
          <div className={callCss.ringingActions}>
            <button type="button" className={callCss.cancelBtn} onClick={declineOrEndCall}>
              Cancel Dialing
            </button>
          </div>
        </div>
      )}

      {/* ── Active Call ── */}
      {callState === "active" && (
        <div style={styles.activeCallContainer}>
          {!isMediaConnected && (
            <div style={styles.connectingBanner}>
              <span style={styles.reconnectingText}>Connecting call...</span>
            </div>
          )}

          {quotaWarning && (
            <div style={styles.quotaWarningBanner}>
              <span style={styles.quotaWarningText}>
                {quotaWarning.message || `~${quotaWarning.remainingMinutes} min left today`}
              </span>
              <button
                style={styles.quotaWarningBtn}
                onClick={() => handleAddExtraMinutes(60)}
                disabled={isAddingMinutes}
              >
                {isAddingMinutes ? "Adding..." : "Add 60 Extra Minutes"}
              </button>
            </div>
          )}

          {isReconnecting && (
            <div style={styles.reconnectingBanner}>
              <span style={styles.reconnectingText}>
                {turnEscalatedRef.current ? "🔄 Switching to relay..." : "🔄 Reconnecting..."}
              </span>
            </div>
          )}

          {/* Debug Panel */}
          {debug === true && (
            <div style={styles.debugPanel}>
              <div style={styles.debugHeader}>🛠 WebRTC Diagnostics</div>
              <div style={styles.debugRow}><span>Connection:</span><span>{debugConnectionState}</span></div>
              <div style={styles.debugRow}><span>ICE State:</span><span>{debugIceState}</span></div>
              <div style={styles.debugRow}><span>Remote Track:</span><span>{remoteTrackStatus}</span></div>
              <div style={styles.debugRow}>
                <span>Candidate:</span>
                <span>
                  {selectedCandidatePairRef.current
                    ? `${selectedCandidatePairRef.current.localType}↔${selectedCandidatePairRef.current.remoteType}`
                    : "—"}
                </span>
              </div>
              <div style={styles.debugRow}><span>Recovery:</span><span>{recoveryAttemptsRef.current}/{MAX_RECOVERY_CYCLES}</span></div>
              <div style={styles.debugRow}><span>Mode:</span><span>{CONNECTION_MODE}</span></div>
              <div style={styles.debugRow}>
                <span>P2P Pred:</span>
                <span>{connectionPredictionRef.current?.p2p_success_probability != null ? `${connectionPredictionRef.current.p2p_success_probability}%` : "—"}</span>
              </div>
              <div style={styles.debugRow}><span>TURN:</span><span>{turnEscalatedRef.current ? "In config" : "No"}</span></div>
              <div style={styles.debugRow}><span>Route:</span><span>{turnFallbackOccurredRef.current ? "Relay" : "P2P"}</span></div>
              <div style={styles.debugRow}><span>Current Step:</span><span>{debugCurrentStep}</span></div>
              <div style={styles.debugRow}><span>Media Status:</span><span>{debugMediaStatus}</span></div>
              {callErrorMessage && <div style={styles.debugError}>⚠️ {callErrorMessage}</div>}
              <button style={styles.debugForcePlayBtn} onClick={forcePlayAllVideos}>Force Play Video</button>
            </div>
          )}

          {/* Voice-only screen */}
          <div style={{ ...styles.audioMainScreen, display: callType === "voice" ? "flex" : "none" }}>
            <div style={styles.avatar}>🗣</div>
            <h3 style={styles.callerName}>Ongoing Voice Call</h3>
            <div style={styles.timer}>{formatDuration(duration)}</div>
          </div>

          {/* Video screen */}
          <div style={{ ...styles.videoMainScreen, display: callType !== "voice" ? "block" : "none" }}>
            {/* muted is intentional and REQUIRED for mobile autoplay compliance.
                iOS/Android Safari blocks unmuted video autoplay even after a user
                gesture if the play() call is async (which ontrack always is).
                Audio from the remote peer is handled by the remoteAudioRef <audio>
                element above, which shares the same MediaStream. Do NOT remove muted. */}
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              style={{
                ...styles.remoteVideo,
                filter: callType === "blind_date" && !cameraUnlocked ? "blur(30px)" : "none",
                transition: "filter 0.5s ease",
              }}
            />
            {callType === "blind_date" && !cameraUnlocked && (
              <div style={styles.blurOverlay}>
                <p style={styles.blurText}>🎭 Video is blurred for the first 5 minutes</p>
              </div>
            )}
            <div style={styles.pipVideoBox}>
              <video ref={localVideoRef} autoPlay muted playsInline style={styles.localVideo} />
            </div>
            <div style={styles.overlayMeta}>
              <div style={styles.timerVideo}>{formatDuration(duration)}</div>
            </div>
          </div>

          {/* Controls */}
          <div style={styles.controlsBar}>
            <button style={{ ...styles.controlBtn, background: muted ? "var(--pink)" : "var(--dark-600)" }} onClick={toggleMute}>
              {muted ? "🔇 Unmute" : "🎙 Mute"}
            </button>
            {(callType === "video" || callType === "blind_date") && (
              <button style={{ ...styles.controlBtn, background: cameraActive ? "var(--dark-600)" : "var(--pink)" }} onClick={toggleCamera}>
                {cameraActive ? "📹 Camera Off" : "📷 Camera On"}
              </button>
            )}
            {callType === "blind_date" && (
              <button
                style={{ ...styles.controlBtn, background: chatSaved ? "var(--teal)" : "var(--pink-dim)", color: chatSaved ? "#fff" : "var(--pink-soft)" }}
                onClick={saveChatVote}
                disabled={chatSaved}
              >
                {chatSaved ? "✓ Vote Saved" : "💖 Save Contact"}
              </button>
            )}
            <button style={{ ...styles.controlBtn, ...styles.declineBtn }} onClick={declineOrEndCall}>📞 End Call</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  overlayContainer: {
    position: "fixed", inset: 0, background: "rgba(8,8,8,0.9)", zIndex: 10000,
    display: "flex", flexDirection: "column",
    backdropFilter: "blur(8px)",
    paddingTop: "env(safe-area-inset-top, 0px)",
    paddingBottom: "env(safe-area-inset-bottom, 0px)",
  },
  callCard: {
    background: "var(--dark-800)", border: "0.5px solid var(--dark-600)", borderRadius: 28,
    width: "90%", maxWidth: 360, padding: "36px 24px", textAlign: "center",
    display: "flex", flexDirection: "column", alignItems: "center", position: "relative", overflow: "hidden",
  },
  avatar: {
    width: 80, height: 80, borderRadius: "50%", background: "var(--pink-dim)",
    border: "2px solid var(--pink)", fontSize: 32, display: "flex",
    alignItems: "center", justifyContent: "center", marginBottom: 20, color: "var(--pink-soft)",
  },
  callerName: { fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: "var(--white)", marginBottom: 8 },
  callTypeLabel: { fontSize: 13, color: "var(--dark-200)", marginBottom: 28 },
  buttonRow: { display: "flex", gap: 12, width: "100%" },
  callBtn: { flex: 1, height: 48, borderRadius: 24, fontSize: 14, fontWeight: 700, border: "none", fontFamily: "var(--font-display)", cursor: "pointer" },
  declineBtn: { background: "#EF4444", color: "#fff" },
  acceptBtn: { background: "var(--teal)", color: "#fff", boxShadow: "0 4px 14px rgba(0,212,170,0.3)" },
  pulseRing: {
    position: "absolute", top: 36, width: 80, height: 80, borderRadius: "50%",
    border: "2px solid var(--pink)", animation: "pulse 1.8s infinite ease-in-out",
  },
  pulseRingDialing: {
    position: "absolute", top: 36, width: 80, height: 80, borderRadius: "50%",
    border: "2px solid var(--pink)", animation: "pulse 1.8s infinite ease-in-out",
  },
  activeCallContainer: { width: "100%", height: "100%", display: "flex", flexDirection: "column", overflow: "hidden" },
  audioMainScreen: { flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 0, overflow: "hidden" },
  timer: { fontSize: 18, color: "var(--pink-soft)", fontWeight: 600, marginTop: 10, fontFamily: "var(--font-mono, monospace)" },
  timerVideo: { background: "rgba(0,0,0,0.5)", padding: "6px 12px", borderRadius: 14, fontSize: 13, color: "#fff", fontFamily: "var(--font-mono, monospace)", zIndex: 2 },
  videoMainScreen: { flex: 1, position: "relative", background: "#000", minHeight: 0, overflow: "hidden" },
  remoteVideo: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" },
  pipVideoBox: { position: "absolute", top: 24, right: 24, width: 90, height: 120, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(255,255,255,0.2)", boxShadow: "0 4px 20px rgba(0,0,0,0.6)", background: "#111", zIndex: 3 },
  localVideo: { width: "100%", height: "100%", objectFit: "cover" },
  overlayMeta: { position: "absolute", bottom: 24, left: 24, zIndex: 2 },
  controlsBar: {
    minHeight: 88, background: "var(--dark-900)", borderTop: "0.5px solid var(--dark-700)",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
    padding: "12px 24px max(12px, env(safe-area-inset-bottom, 12px))", flexShrink: 0, zIndex: 10,
  },
  controlBtn: { height: 44, padding: "0 20px", borderRadius: 22, border: "none", color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "var(--font-display)", display: "flex", alignItems: "center", gap: 6 },
  blurOverlay: { position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.4)", pointerEvents: "none" },
  blurText: { fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 600, color: "#fff", background: "rgba(0,0,0,0.6)", padding: "8px 16px", borderRadius: 20, border: "0.5px solid var(--dark-500)" },
  connectingBanner: { position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(59,130,246,0.9)", backdropFilter: "blur(8px)", padding: "8px 16px", borderRadius: 20, border: "0.5px solid rgba(255,255,255,0.2)", zIndex: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" },
  reconnectingBanner: { position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", background: "rgba(239,68,68,0.85)", backdropFilter: "blur(8px)", padding: "8px 16px", borderRadius: 20, border: "0.5px solid rgba(255,255,255,0.2)", zIndex: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.5)" },
  reconnectingText: { color: "#fff", fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 600 },
  quotaWarningBanner: { position: "absolute", top: 72, left: "50%", transform: "translateX(-50%)", background: "rgba(245,158,11,0.95)", backdropFilter: "blur(8px)", padding: "10px 16px", borderRadius: 20, border: "0.5px solid rgba(255,255,255,0.2)", zIndex: 999, boxShadow: "0 4px 12px rgba(0,0,0,0.5)", display: "flex", alignItems: "center", gap: 12, maxWidth: "90%" },
  quotaWarningText: { color: "#fff", fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 600 },
  quotaWarningBtn: { height: 32, padding: "0 14px", borderRadius: 16, border: "none", background: "#fff", color: "#B45309", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "var(--font-display)", whiteSpace: "nowrap" },
  debugPanel: { position: "absolute", top: 24, left: 24, width: 300, background: "rgba(18,18,18,0.95)", border: "1px solid var(--dark-500)", borderRadius: 12, padding: 16, zIndex: 9999, fontFamily: "var(--font-display), system-ui, sans-serif", fontSize: 12, color: "#fff", boxShadow: "0 8px 32px rgba(0,0,0,0.5)", backdropFilter: "blur(8px)", display: "flex", flexDirection: "column", gap: 8 },
  debugHeader: { fontWeight: 700, fontSize: 13, color: "var(--pink-soft)", borderBottom: "0.5px solid var(--dark-600)", paddingBottom: 6, marginBottom: 4 },
  debugRow: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  debugError: { background: "rgba(239,68,68,0.2)", border: "0.5px solid #EF4444", borderRadius: 6, padding: 8, color: "#FCA5A5", fontWeight: 500 },
  debugForcePlayBtn: { marginTop: 8, height: 32, background: "var(--pink)", color: "#fff", border: "none", borderRadius: 16, fontWeight: 600, cursor: "pointer", fontSize: 11, transition: "background 0.2s ease" },
};
