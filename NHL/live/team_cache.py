"""
Simple disk-based cache for team recent games to avoid hammering NHL API.
"""
import json
import time
from pathlib import Path
from typing import Dict, List, Optional

# Cache directory
CACHE_DIR = Path(__file__).parent.parent / "data" / ".team_cache"
CACHE_DIR.mkdir(exist_ok=True)

# Cache TTL in seconds (5 minutes default)
DEFAULT_TTL = 300


class TeamCache:
    """Simple file-based cache for team games."""
    
    def __init__(self, cache_dir: Path = CACHE_DIR, ttl: int = DEFAULT_TTL):
        self.cache_dir = cache_dir
        self.ttl = ttl
        self._memory_cache: Dict[str, tuple[float, List]] = {}
    
    def _cache_path(self, team_abbr: str) -> Path:
        """Get cache file path for a team."""
        return self.cache_dir / f"{team_abbr}.json"
    
    def get(self, team_abbr: str) -> Optional[List]:
        """Get cached games for a team if not expired."""
        # Check memory cache first
        if team_abbr in self._memory_cache:
            timestamp, games = self._memory_cache[team_abbr]
            if time.time() - timestamp < self.ttl:
                return games
        
        # Check disk cache
        cache_file = self._cache_path(team_abbr)
        if not cache_file.exists():
            return None
        
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
            
            timestamp = data.get('timestamp', 0)
            games = data.get('games', [])
            
            # Check if expired
            if time.time() - timestamp > self.ttl:
                return None
            
            # Store in memory cache
            self._memory_cache[team_abbr] = (timestamp, games)
            return games
        
        except (json.JSONDecodeError, KeyError, OSError):
            return None
    
    def set(self, team_abbr: str, games: List):
        """Cache games for a team."""
        timestamp = time.time()
        
        # Store in memory cache
        self._memory_cache[team_abbr] = (timestamp, games)
        
        # Store on disk
        cache_file = self._cache_path(team_abbr)
        try:
            with open(cache_file, 'w') as f:
                json.dump({
                    'timestamp': timestamp,
                    'games': games
                }, f)
        except OSError as e:
            print(f"Warning: Could not write cache for {team_abbr}: {e}")
    
    def clear(self):
        """Clear all cache files."""
        self._memory_cache.clear()
        for cache_file in self.cache_dir.glob("*.json"):
            try:
                cache_file.unlink()
            except OSError:
                pass


# Global cache instance
_cache = TeamCache()


def get_cached_team_games(team_abbr: str) -> Optional[List]:
    """Get cached team games."""
    return _cache.get(team_abbr)


def cache_team_games(team_abbr: str, games: List):
    """Cache team games."""
    _cache.set(team_abbr, games)


def clear_team_cache():
    """Clear all cached team games."""
    _cache.clear()
