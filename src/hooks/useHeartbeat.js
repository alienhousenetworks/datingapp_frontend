// src/hooks/useHeartbeat.js
import { useEffect, useRef } from "react";
import { userAPI, profileAPI } from "../api";

/**
 * Presence + location heartbeat.
 * Re-reads device GPS on each interval so city changes are pushed to the backend
 * (previous version cached the first fix forever).
 */
export default function useHeartbeat(active = true) {
  const intervalRef = useRef(null);
  const locationRef = useRef({ lat: null, lon: null });

  useEffect(() => {
    if (!active) return;

    const sendPing = async (lat, lon) => {
      if (lat === null || lon === null || lat === undefined || lon === undefined) return;
      if (!localStorage.getItem("access_token")) return;
      try {
        await userAPI.lastActive(lat, lon);
      } catch {}
    };

    const loadCoordsFromProfile = async () => {
      if (!localStorage.getItem("access_token")) return null;
      try {
        const profile = await profileAPI.getMyProfile();
        if (profile && profile.latitude && profile.longitude) {
          const lat = parseFloat(profile.latitude);
          const lon = parseFloat(profile.longitude);
          locationRef.current = { lat, lon };
          return { lat, lon };
        }
      } catch {}
      return null;
    };

    const readDeviceGps = () =>
      new Promise((resolve) => {
        if (!navigator.geolocation) {
          resolve(null);
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            locationRef.current = { lat, lon };
            resolve({ lat, lon });
          },
          () => resolve(null),
          // maximumAge 0 → prefer a fresh fix so city changes are detected
          { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 }
        );
      });

    const pingOnce = async () => {
      if (!localStorage.getItem("access_token")) return;
      let coords = await readDeviceGps();
      if (!coords) {
        coords = locationRef.current.lat != null
          ? locationRef.current
          : await loadCoordsFromProfile();
      }
      if (coords?.lat != null && coords?.lon != null) {
        await sendPing(coords.lat, coords.lon);
      }
    };

    pingOnce();
    // Every 2 minutes — frequent enough to pick up city travel while app is open
    intervalRef.current = setInterval(pingOnce, 2 * 60 * 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [active]);
}
