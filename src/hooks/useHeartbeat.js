// src/hooks/useHeartbeat.js
import { useEffect, useRef } from "react";
import { userAPI, profileAPI } from "../api";

export default function useHeartbeat(active = true) {
  const intervalRef = useRef(null);
  const locationRef = useRef({ lat: null, lon: null });
  const hasPingedRef = useRef(false);

  useEffect(() => {
    if (!active) return;

    const sendPing = async (lat, lon) => {
      if (lat === null || lon === null || lat === undefined || lon === undefined) return;
      if (!localStorage.getItem("access_token")) return;
      try {
        await userAPI.lastActive(lat, lon);
        hasPingedRef.current = true;
      } catch {}
    };

    const useProfileLocation = async () => {
      if (!localStorage.getItem("access_token")) return;
      try {
        const profile = await profileAPI.getMyProfile();
        if (profile && profile.latitude && profile.longitude) {
          const lat = parseFloat(profile.latitude);
          const lon = parseFloat(profile.longitude);
          locationRef.current = { lat, lon };
          sendPing(lat, lon);
        }
      } catch {}
    };

    if (navigator.geolocation) {
      // maximumAge allows cached GPS — reduces kCLErrorLocationUnknown spam
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lon = pos.coords.longitude;
          locationRef.current = { lat, lon };
          sendPing(lat, lon);
        },
        async () => {
          // Denied / unknown / timeout — fall back to profile coords (no hard fail)
          if (!hasPingedRef.current) {
            await useProfileLocation();
          }
        },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 }
      );
    } else {
      useProfileLocation();
    }

    // Set up subsequent pings every 5 minutes
    intervalRef.current = setInterval(async () => {
      if (!localStorage.getItem("access_token")) return;
      let { lat, lon } = locationRef.current;
      if (lat === null || lon === null) {
        try {
          const profile = await profileAPI.getMyProfile();
          if (profile && profile.latitude && profile.longitude) {
            lat = parseFloat(profile.latitude);
            lon = parseFloat(profile.longitude);
            locationRef.current = { lat, lon };
          }
        } catch {}
      }
      if (lat !== null && lon !== null) {
        sendPing(lat, lon);
      }
    }, 5 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [active]);
}
