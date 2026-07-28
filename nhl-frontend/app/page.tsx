'use client';

import { useEffect, useMemo, useState } from 'react';
import { Sparkles } from 'lucide-react';

import PortfolioSection from '@/components/PortfolioSection';
import PredictionPanel from '@/components/PredictionPanel';
import ValueBoardSection from '@/components/ValueBoardSection';
import {
  CAN_UPDATE_PORTFOLIO,
  fetchMeta,
  fetchPortfolio as loadPortfolio,
  fetchPrediction,
  fetchTeams,
  fetchValueReport,
  updatePortfolio,
} from '@/lib/data';
import { formatGeneratedAt } from '@/lib/format';
import { PortfolioResponse, PredictionResponse, SiteMeta, Team, ValueGame } from '@/types';

const DAYS_AHEAD = 3; // i dag + 3 = 4 dagers horisont

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
  const [meta, setMeta] = useState<SiteMeta | null>(null);

  const fetchPortfolio = async () => {
    setLoadingPortfolio(true);
    setPortfolioError('');
    try {
      setPortfolio(await loadPortfolio());
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
      setPortfolio(await updatePortfolio(valueGames));
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : '';
      setPortfolioError(msg || 'Kunne ikke oppdatere porteføljen');
    } finally {
      setUpdatingPortfolio(false);
    }
  };

  useEffect(() => {
    fetchTeams()
      .then(setTeams)
      .catch((err) => console.error('Feil ved henting av lag:', err));
  }, []);

  useEffect(() => {
    fetchMeta().then(setMeta);
  }, []);

  useEffect(() => {
    async function loadValueBoard() {
      setLoadingValueBoard(true);
      setValueError('');
      try {
        setValueGames(await fetchValueReport(DAYS_AHEAD));
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
      setPrediction(await fetchPrediction(homeTeam, awayTeam));
    } catch (err) {
      console.error(err);
      const message = err instanceof Error && err.message ? err.message : '';
      setError(message || 'Kunne ikke hente prediksjon.');
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
          {meta && (
            <p className="text-sm text-slate-400">
              Data oppdatert {formatGeneratedAt(meta.generated_at)}
              {meta.failed?.length > 0 && (
                <span className="text-amber-300">
                  {' '}
                  – disse er fra forrige oppdatering: {meta.failed.join(', ')}
                </span>
              )}
            </p>
          )}
        </div>

        <PortfolioSection
          portfolio={portfolio}
          portfolioError={portfolioError}
          loadingPortfolio={loadingPortfolio}
          updatingPortfolio={updatingPortfolio}
          onRefresh={handleRefreshPortfolio}
          onRetry={fetchPortfolio}
          showRefresh={CAN_UPDATE_PORTFOLIO}
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
