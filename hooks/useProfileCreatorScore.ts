import { useState, useEffect } from "react";
import { getCachedData, setCachedData, CACHE_DURATIONS } from "@/lib/utils";
import { getCreatorScoreForTalentId } from "@/app/services/scoresService";

export function useProfileCreatorScore(talentUUID: string) {
  const [creatorScore, setCreatorScore] = useState<number | null>(null);
  const [lastCalculatedAt, setLastCalculatedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchScore() {
      const cacheKey = `creator_score_data_${talentUUID}`;

      // Check cache first
      const cachedData = getCachedData<{
        score: number;
        lastCalculatedAt: string | null;
      }>(cacheKey, CACHE_DURATIONS.SCORE_BREAKDOWN);
      if (cachedData !== null) {
        setCreatorScore(cachedData.score);
        setLastCalculatedAt(cachedData.lastCalculatedAt);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Use service layer instead of direct API call
        const scoreData = await getCreatorScoreForTalentId(talentUUID);

        if (scoreData.error) {
          setError(scoreData.error);
          setCreatorScore(null);
          setLastCalculatedAt(null);
        } else {
          setCreatorScore(scoreData.score);
          setLastCalculatedAt(scoreData.lastCalculatedAt);

          // Cache the complete score data
          setCachedData(cacheKey, {
            score: scoreData.score,
            lastCalculatedAt: scoreData.lastCalculatedAt,
          });
        }
      } catch (err) {
        console.error("Error fetching creator score:", err);
        setError(
          err instanceof Error ? err.message : "Failed to fetch creator score",
        );
        setCreatorScore(null);
        setLastCalculatedAt(null);
      } finally {
        setLoading(false);
      }
    }

    if (talentUUID) {
      fetchScore();
    }
  }, [talentUUID]);

  return { creatorScore, lastCalculatedAt, loading, error };
}
