import { useState, useEffect, useCallback } from "react";
import { subscriptionAPI } from "../api";

export default function useSubscription(enabled = true) {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    if (!enabled) return null;
    setLoading(true);
    setError("");
    try {
      const data = await subscriptionAPI.getStatus();
      setStatus(data);
      return data;
    } catch (err) {
      setError(err.message || "Failed to load subscription");
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const purchase = async () => {
    setLoading(true);
    setError("");
    try {
      const key = `sub_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const res = await subscriptionAPI.purchase(key);
      
      if (res.status === 'pending' && res.razorpay_order_id) {
        // Open Razorpay Widget
        const options = {
          key: res.razorpay_key_id,
          amount: res.amount,
          currency: res.currency,
          name: "Spyce Premium",
          description: "Subscription Purchase",
          order_id: res.razorpay_order_id,
          handler: function (response) {
            // Payment success. Wait a bit for webhook, then refresh
            setTimeout(() => {
              refresh();
              setLoading(false);
            }, 2000);
          },
          theme: {
            color: "#FF4D6D"
          },
          modal: {
            ondismiss: function() {
              setLoading(false);
            }
          }
        };
        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (response) {
           setError(response.error.description || "Payment failed");
        });
        rzp.open();
      } else {
        await refresh();
        setLoading(false);
      }
      return res;
    } catch (err) {
      setError(err.message || "Purchase failed");
      setLoading(false);
      throw err;
    }
  };

  return {
    status,
    loading,
    error,
    refresh,
    purchase,
    hasAccess: status?.has_access ?? true,
    requiresSubscription: status?.requires_subscription ?? false,
    isFree: status?.is_free ?? false,
    trialDaysRemaining: status?.trial_days_remaining ?? 0,
  };
}