'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import PortfolioSection from '@/components/PortfolioSection';
import PredictionPanel from '@/components/PredictionPanel';
import ValueBoardSection from '@/components/ValueBoardSection';
import { PortfolioResponse, PredictionResponse, Team, ValueGame } from '@/types';

const API_BASE_RAW =
  process.env.NEXT_PUBLIC_API_BASE ??
  (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');
const API_BASE = API_BASE_RAW.endsWith('/') ? API_BASE_RAW.slice(0, -1) : API_BASE_RAW;
const IS_LOCAL_API =
  API_BASE.includes('localhost') || API_BASE.includes('127.0.0.1') || API_BASE.startsWith('/');

const apiUrl = (path: string) => `${API_BASE}${path.startsWith('/') ? path : `/${path}`}`;
const DAYS_AHEAD = 7; // i dag + 7 = 8 dagers horisont

export default function Home() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [homeTeam, setHomeTeam] = useState('');
  const [awayTeam, setAwayTeam] = useState('');
  const [prediction, setPrediction] = useState<PredictionResponse | null>(null);
  const [loadingPrediction, setLoadingPrediction] = useState(false);
  const [error, setError] = useState('');
  const [valueGames, setValueGames] = useState<ValueGame[]>([]);
  const [valueError, setValueError] = useState('');
  const [loadingValueBoard, setLoadingValueBoard] = useState(true);
  const [portfolio, setPortfolio] = useState<PortfolioResponse | null>(null);
  const [loadingPortfolio, setLoadingPortfolio] = useState(true);
  const [portfolioError, setPortfolioError] = useState('');
  const [updatingPortfolio, setUpdatingPortfolio] = useState(false);

  const fetchPortfolio = async () => {
    setLoadingPortfolio(true);
    setPortfolioError('');
    try {
      const res = await fetch(apiUrl('/portfolio'));
      if (!res.ok) {
        throw new Error('Kunne ikke hente porteføljen');
      }
      const data = await res.json();
      setPortfolio(data);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      setPortfolioError(msg || 'Kunne ikke hente porteføljen');
    } finally {
      setLoadingPortfolio(false);
    }
  };

  const handleRefreshPortfolio = async () => {
    setUpdatingPortfolio(true);
    setPortfolioError('');
    try {
      const res = await fetch(apiUrl('/portfolio/update'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          days_ahead: 1,
          stake_per_bet: 100,
          min_value: 0.01,
          value_games: valueGames, // sender allerede hentet odds/matchdata for raskere oppdatering
        }),
      });
      if (!res.ok) {
        throw new Error('Oppdatering feilet');
      }
      const data = await res.json();
      setPortfolio(data);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      setPortfolioError(msg || 'Kunne ikke oppdatere porteføljen');
    } finally {
      setUpdatingPortfolio(false);
    }
  };

  useEffect(() => {
    fetch(apiUrl('/teams'))
      .then((res) => res.json())
      .then(setTeams)
      .catch((err) => console.error('Feil ved henting av lag:', err));
  }, []);

  useEffect(() => {
    async function loadValueBoard() {
      setLoadingValueBoard(true);
      setValueError('');
      try {
        let res = await fetch(apiUrl(`/value-report?days=${DAYS_AHEAD}`));
        if (res.status === 404) {
          // Backend kan kjøre uten bindestrek-ruten (fallback)
          res = await fetch(apiUrl(`/value_report?days=${DAYS_AHEAD}`));
        }
        if (!res.ok) {
          let reason = '';
          try {
            const body = await res.json();
            reason = body?.detail || body?.message || '';
          } catch {
            try {
              reason = await res.text();
            } catch {
              reason = '';
            }
          }
          throw new Error(reason || 'Kunne ikke hente oddsrapport');
        }
        const data = await res.json();
        setValueGames(data);
      } catch (err) {
        console.error(err);
        const message = err instanceof Error && err.message ? err.message : '';
        setValueError(`Kunne ikke hente oddsbildet akkurat nå${message ? `: ${message}` : ''}`);
      } finally {
        setLoadingValueBoard(false);
      }
    }

    loadValueBoard();
  }, []);

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const gamesByDate = useMemo(() => groupGamesByDate(valueGames), [valueGames]);
  const sortedDates = useMemo(() => Object.keys(gamesByDate).sort(), [gamesByDate]);

  const handlePredict = async () => {
    if (!homeTeam || !awayTeam) {
      setError('Vennligst velg begge lag');
      return;
    }

    if (homeTeam === awayTeam) {
      setError('Lagene må være forskjellige');
      return;
    }

    setLoadingPrediction(true);
    setError('');
    setPrediction(null);

    try {
      const response = await fetch(apiUrl('/predict'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ home_team: homeTeam, away_team: awayTeam }),
      });

      if (!response.ok) {
        throw new Error('Feil ved prediksjon');
      }

      const data = await response.json();
      setPrediction(data);
    } catch (err) {
      setError('Kunne ikke hente prediksjon. Sjekk at API-serveren kjører.');
      console.error(err);
    } finally {
      setLoadingPrediction(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="container mx-auto px-4 py-10">
        <div className="mb-10 flex flex-col gap-3">
          <div className="inline-flex items-center gap-2 text-sm font-semibold text-blue-200">
            <Sparkles className="h-4 w-4 text-blue-300" />
            Verdifunn fra ML-modellen
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
            NHL odds og verdi – dag for dag
          </h1>
          <p className="max-w-3xl text-lg text-slate-200">
            Se modellens odds for hver kamp, sammenlign med markedet, og finn raskt hvor verdien er størst. Manuell matchup
            ligger til høyre hvis du vil teste egne scenarier.
          </p>
        </div>

        <PortfolioSection
          portfolio={portfolio}
          portfolioError={portfolioError}
          loadingPortfolio={loadingPortfolio}
          updatingPortfolio={updatingPortfolio}
          onRefresh={handleRefreshPortfolio}
          onRetry={fetchPortfolio}
          showRefresh={IS_LOCAL_API}
        />

        <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
          <ValueBoardSection
            daysAhead={DAYS_AHEAD}
            loading={loadingValueBoard}
            error={valueError}
            sortedDates={sortedDates}
            gamesByDate={gamesByDate}
          />

          <PredictionPanel
            teams={teams}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            error={error}
            loading={loadingPrediction}
            prediction={prediction}
            onHomeChange={setHomeTeam}
            onAwayChange={setAwayTeam}
            onPredict={handlePredict}
          />
        </div>
      </div>
    </main>
  );
}

function groupGamesByDate(games: ValueGame[]) {
  const grouped: Record<string, ValueGame[]> = {};

  games.forEach((game) => {
    const dateKey = game.date || (game.start_time ? game.start_time.slice(0, 10) : 'Ukjent dato');
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(game);
  });

  Object.values(grouped).forEach((list) => {
    list.sort((a, b) => {
      const aTime = new Date(a.start_time).getTime();
      const bTime = new Date(b.start_time).getTime();
      return (isNaN(aTime) ? Infinity : aTime) - (isNaN(bTime) ? Infinity : bTime);
    });
  });

  return grouped;
}
