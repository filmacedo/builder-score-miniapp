import { useState, useRef } from "react";
import { triggerScoreCalculation } from "@/app/services/scoreRefreshService";

interface UseScoreRefreshResult {
  isRefreshing: boolean;
  successMessage: string | null;
  error: string | null;
  refreshScore: () => Promise<void>;
  clearError: () => void;
}

export function useScoreRefresh(
  talentUUID: string,
  onSuccess?: () => void,
): UseScoreRefreshResult {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const successTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const hasCalledSuccessRef = useRef(false);

  const clearError = () => {
    setError(null);
  };

  const refreshScore = async () => {
    if (!talentUUID || isRefreshing) return;

    try {
      setIsRefreshing(true);
      // Clear any existing messages
      setError(null);
      setSuccessMessage(null);
      hasCalledSuccessRef.current = false;

      const result = await triggerScoreCalculation(talentUUID);

      if (result.success) {
        setSuccessMessage("Calculation enqueued");
        // Call onSuccess callback to trigger score refetch
        // Only call once per refresh to prevent loops
        if (onSuccess && !hasCalledSuccessRef.current) {
          hasCalledSuccessRef.current = true;
          // Small delay to show success message before refetching
          setTimeout(async () => {
            try {
              await onSuccess();
            } catch (error) {
              console.error("Error during score refetch:", error);
            } finally {
              // Keep isRefreshing true for a bit longer after refetch completes
              // to prevent flickering between states
              setTimeout(() => {
                setIsRefreshing(false);
              }, 500);
            }
          }, 1000);
        } else {
          // If no onSuccess callback, reset immediately
          setIsRefreshing(false);
        }
        // No auto-clear of success message
      } else {
        const errorMessage = result.error || "Failed to trigger calculation";
        setError(errorMessage);
        setIsRefreshing(false);
        // No auto-clear of error message
      }
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Failed to trigger calculation";
      setError(errorMessage);
      setIsRefreshing(false);
      // No auto-clear of error message
    }
  };

  return {
    isRefreshing,
    successMessage,
    error,
    refreshScore,
    clearError,
  };
}
