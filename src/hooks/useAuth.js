import { useState } from "react";
import { authAPI, userAPI, clearTokens, getAccessToken } from "../api";

export default function useAuth() {
  const [step, setStep] = useState("email");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [msg, setMsg] = useState("");

  const requestOTP = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authAPI.requestOTP(email);
      if (data.error) {
        setError(data.error);
      } else {
        setMsg(`OTP sent to ${email}`);
        setStep("otp");
      }
    } catch {
      setMsg("Demo mode — use any 6-digit code");
      setStep("otp");
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async (onLogin) => {
    setLoading(true);
    setError("");
    try {
      const { ok, data } = await authAPI.verifyOTP(email, otp);
      if (!ok) {
        setError(data.error || "Invalid OTP. Try again.");
      } else {
        // is_new from OTP is informational only — never force signup UI from it.
        // Existing accounts also log in through the same OTP path.
        const me = await loadUser();
        if (me) {
          onLogin?.(me);
        } else {
          // Tokens saved but /users/me failed — still log in; App will gate on profile.
          const fallback = {
            id: data.user_id || data.user?.id || null,
            email,
            is_new: data.is_new === true,
          };
          setUser(fallback);
          onLogin?.(fallback);
        }
      }
    } catch {
      // Offline / Demo fallback
      const demo = {
        id: "demo-user",
        email: email || "demo@spyce.com",
        name: "Demo User",
        is_new: false,
      };
      setUser(demo);
      onLogin?.(demo);
    } finally {
      setLoading(false);
    }
  };

  const resendOTP = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await authAPI.resendOTP(email);
      if (data.error) {
        setError(data.error);
      } else {
        setMsg(data.message || `OTP resent to ${email}`);
      }
    } catch (err) {
      setError("Could not resend OTP. Please wait and try again.");
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    setStep("email");
    setOtp("");
    setError("");
    setMsg("");
  };

  /** @returns {object|null} user payload when session is valid */
  const loadUser = async () => {
    if (!getAccessToken()) return null;
    try {
      const data = await userAPI.getMe();
      if (data?.id) {
        setUser(data);
        return data;
      }
      return null;
    } catch {
      return null;
    }
  };

  const logout = async () => {
    await authAPI.logout();
    clearTokens();
    setUser(null);
    setStep("email");
    setEmail("");
    setOtp("");
  };

  return {
    step,
    email,
    setEmail,
    otp,
    setOtp,
    user,
    loading,
    error,
    msg,
    requestOTP,
    verifyOTP,
    resendOTP,
    goBack,
    loadUser,
    logout,
  };
}
