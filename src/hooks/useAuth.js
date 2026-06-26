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
        const loggedIn = await loadUser();
        if (loggedIn) {
          onLogin();
        } else {
          setUser({ id: data.user_id || "demo-user", email, is_new: true });
          onLogin();
        }
      }
    } catch {
      // Offline / Demo fallback
      setUser({ id: "demo-user", email: email || "demo@spyce.com", name: "Demo User", is_new: false });
      onLogin(); // demo fallback
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

  const loadUser = async () => {
    if (!getAccessToken()) return false;
    try {
      const data = await userAPI.getMe();
      if (data.id) {
        setUser(data);
        return true;
      }
      return false;
    } catch {
      return false;
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
