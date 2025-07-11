import { NextRequest, NextResponse } from "next/server";

type Profile = {
  id: string;
  display_name?: string;
  name?: string;
  image_url?: string;
  scores?: { slug: string; points?: number }[];
};

export async function GET(req: NextRequest) {
  const apiKey = process.env.TALENT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Missing Talent API key" },
      { status: 500 },
    );
  }
  const { searchParams } = req.nextUrl;
  const page = parseInt(searchParams.get("page") || "1", 10);
  const perPage = parseInt(
    searchParams.get("per_page") || searchParams.get("perPage") || "25",
    10,
  );
  const statsOnly = searchParams.get("statsOnly") === "true";

  const baseUrl = "https://api.talentprotocol.com/search/advanced/profiles";

  // Build query object based on what we need
  const query: {
    score: {
      min: number;
      scorer: string;
    };
  } = {
    score: {
      min: 1,
      scorer: "Creator Score",
    },
  };

  const data = {
    query,
    sort: {
      score: { order: "desc", scorer: "Creator Score" },
      id: { order: "desc" },
    },
    page,
    per_page: perPage,
  };

  const queryString = [
    `query=${encodeURIComponent(JSON.stringify(data.query))}`,
    `sort=${encodeURIComponent(JSON.stringify(data.sort))}`,
    `page=${page}`,
    `per_page=${perPage}`,
  ].join("&");

  const res = await fetch(`${baseUrl}?${queryString}`, {
    headers: {
      Accept: "application/json",
      "X-API-KEY": apiKey,
    },
  });
  if (!res.ok) {
    const errorText = await res.text();
    return NextResponse.json({ error: errorText }, { status: res.status });
  }
  const json = await res.json();

  // If we only want stats, return them directly
  if (statsOnly) {
    const totalCreators = json.pagination?.total || 0;
    // For minScore, we could either:
    // 1. Use a fixed threshold (e.g., 100 points)
    // 2. Fetch the 100th creator specifically
    // 3. Use the lowest score in the current page
    // Let's use option 1 for now - a fixed minimum of 100 points to qualify for rewards
    const minScore = 100;

    // Fetch eligible creators count (score >= 80, which is Level 3+)
    const eligibleQuery = {
      score: {
        min: 80,
        scorer: "Creator Score",
      },
    };

    const eligibleData = {
      query: eligibleQuery,
      page: 1,
      per_page: 1, // We only need the count, not the actual profiles
    };

    const eligibleQueryString = [
      `query=${encodeURIComponent(JSON.stringify(eligibleData.query))}`,
      `page=1`,
      `per_page=1`,
    ].join("&");

    try {
      const eligibleRes = await fetch(`${baseUrl}?${eligibleQueryString}`, {
        headers: {
          Accept: "application/json",
          "X-API-KEY": apiKey,
        },
      });

      let eligibleCreators = 0;
      if (eligibleRes.ok) {
        const eligibleJson = await eligibleRes.json();
        eligibleCreators = eligibleJson.pagination?.total || 0;
      }

      return NextResponse.json({
        minScore,
        totalCreators,
        eligibleCreators,
      });
    } catch (error) {
      // If the eligible creators query fails, fallback to the estimate
      console.error("Failed to fetch eligible creators count:", error);
      return NextResponse.json({
        minScore,
        totalCreators,
        eligibleCreators: Math.floor(totalCreators * 0.3), // Fallback estimate
      });
    }
  }

  // Step 1: Map each profile to its highest Creator Score
  const mapped = (json.profiles || []).map((profile: Profile) => {
    const p = profile;
    const creatorScores = Array.isArray(p.scores)
      ? p.scores
          .filter((s) => s.slug === "creator_score")
          .map((s) => s.points ?? 0)
      : [];
    const score = creatorScores.length > 0 ? Math.max(...creatorScores) : 0;
    return {
      name: p.display_name || p.name || "Unknown",
      pfp: p.image_url || undefined,
      score,
      rewards: "-", // To be calculated later
      id: p.id,
      talent_protocol_id: p.id, // Add the missing talent_protocol_id field
    };
  });

  // Step 2: Sort by score descending
  mapped.sort(
    (a: { score: number }, b: { score: number }) => b.score - a.score,
  );

  // Step 3: Assign ranks
  let lastScore: number | null = null;
  let lastRank = 0;
  let ties = 0;
  const ranked = mapped.map((entry: { score: number }, idx: number) => {
    let rank;
    if (entry.score === lastScore) {
      rank = lastRank;
      ties++;
    } else {
      rank = idx + 1;
      if (ties > 0) rank = lastRank + ties;
      lastScore = entry.score;
      lastRank = rank;
      ties = 1;
    }
    return {
      ...entry,
      rank,
    };
  });

  // Calculate stats for backward compatibility
  const minScore = 100; // Fixed threshold for rewards qualification
  const totalCreators = json.pagination?.total || ranked.length;

  return NextResponse.json({ entries: ranked, minScore, totalCreators });
}
