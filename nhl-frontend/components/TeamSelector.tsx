import { Team } from '@/types';
import { Home, Plane } from 'lucide-react';

interface TeamSelectorProps {
  label: string;
  teams: Team[];
  selectedTeam: string;
  onChange: (team: string) => void;
  iconType: 'home' | 'away';
}

export default function TeamSelector({
  label,
  teams,
  selectedTeam,
  onChange,
  iconType,
}: TeamSelectorProps) {
  const Icon = iconType === 'home' ? Home : Plane;
  
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-gray-200 mb-2">
        <Icon className="w-5 h-5" />
        {label}
      </label>
      <select
        value={selectedTeam}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-3 rounded-lg border border-white/20 bg-slate-900 text-lg focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-400 ${selectedTeam ? 'text-white' : 'text-gray-300'}`}
      >
        <option value="">Velg lag...</option>
        {teams.map((team) => (
          <option key={team.abbreviation} value={team.abbreviation}>
            {team.abbreviation}
          </option>
        ))}
      </select>
    </div>
  );
}
