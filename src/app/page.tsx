"use client";

/**
 * App shell: home ⇄ play ⇄ results, session wiring, stats recording,
 * and the Pollinations BYOP sign-in lifecycle (OAuth callback on mount).
 *
 * Guest mode is 100% static (pre-baked fakes, no keys, no logins).
 * Signed-in players unlock Live Forge, where every fake is generated
 * on the fly with their own Pollen budget.
 */

import { useCallback, useEffect, useState } from "react";
import type { GameMode, GameSession, RoundDatum } from "@/lib/types";
import { ROUNDS_PER_GAME } from "@/lib/game";
import { buildSessionRounds } from "@/lib/rounds";
import { todayKey } from "@/lib/rng";
import {
  emptyStats,
  loadStats,
  saveStats,
  type Stats,
} from "@/lib/stats";
import {
  beginSignIn,
  clearLiveSession,
  handleOAuthCallback,
  isLiveConfigured,
  loadLiveSession,
  type LiveSession,
} from "@/lib/pollinations";
import HomeView from "@/components/game/HomeView";
import GameView from "@/components/game/GameView";
import ResultsView from "@/components/game/ResultsView";

type Phase = "home" | "play" | "results";

export default function Page() {
  const [phase, setPhase] = useState<Phase>("home");
  const [mode, setMode] = useState<GameMode>("classic");
  const [rounds, setRounds] = useState<RoundDatum[]>([]);
  const [finalSession, setFinalSession] = useState<GameSession | null>(null);
  const [stats, setStats] = useState<Stats>({ ...emptyStats() });
  const [statsLoaded, setStatsLoaded] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [live, setLive] = useState<LiveSession | null>(null);

  // load stats once on mount (client-only values; hydration-safe pattern),
  // then complete the Pollinations OAuth handshake if we were just
  // redirected back from enter.pollinations.ai.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStats(loadStats());
    setStatsLoaded(true);
    void (async () => {
      const fromCallback = await handleOAuthCallback();
      if (fromCallback) {
        setLive(fromCallback);
        return;
      }
      const existing = loadLiveSession();
      if (existing) setLive(existing);
    })();
  }, []);

  const start = useCallback((m: GameMode) => {
    setMode(m);
    setRounds(buildSessionRounds(m, ROUNDS_PER_GAME, Date.now() & 0xffffffff));
    setRunKey((k) => k + 1);
    setPhase("play");
  }, []);

  const signIn = useCallback(() => {
    void beginSignIn();
  }, []);

  const signOut = useCallback(() => {
    clearLiveSession();
    setLive(null);
  }, []);

  const finish = useCallback(
    (session: GameSession) => {
      // record stats (never for practice runs)
      if (session.mode !== "practice") {
        const s = loadStats();
        s.bestScore = Math.max(s.bestScore, session.score);
        s.bestStreak = Math.max(s.bestStreak, session.bestStreak);
        s.gamesPlayed += 1;
        s.roundsSeen += session.played.length;
        s.roundsCorrect += session.played.filter((p) => p.correct).length;
        for (const p of session.played) {
          s[p.kind].total += 1;
          if (p.correct) s[p.kind].correct += 1;
        }
        if (session.mode === "daily") {
          s.lastDaily = todayKey();
          s.lastDailyScore = session.score;
        }
        saveStats(s);
        setStats(s);
      }
      setFinalSession(session);
      setPhase("results");
    },
    [],
  );

  if (phase === "play" && rounds.length > 0) {
    return (
      <GameView
        key={runKey}
        mode={mode}
        initialRounds={rounds}
        liveSession={mode === "live" ? live : null}
        onFinish={finish}
        onQuit={() => setPhase("home")}
      />
    );
  }

  if (phase === "results" && finalSession) {
    return (
      <ResultsView
        session={finalSession}
        onReplay={() => start(finalSession.mode)}
        onHome={() => setPhase("home")}
      />
    );
  }

  return (
    <HomeView
      stats={stats}
      statsLoaded={statsLoaded}
      onStart={start}
      live={live}
      liveConfigured={isLiveConfigured()}
      onSignIn={signIn}
      onSignOut={signOut}
    />
  );
}
