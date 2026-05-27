// ============================================================================
// AURA: Deterministic Entity Resolution Service
// Normalizes fuzzy human or API inputs into Canonical Sports Abbreviations
// ============================================================================

export type SportsLeague = 'nba' | 'nfl' | 'mlb' | 'nhl' | string;

export interface ResolutionOptions {
    league?: SportsLeague;
    fallbackToInput?: boolean;
}

// ============================================================================
// 1. Cross-League Disambiguation Map
// Resolves mascots that are shared identically across different sports leagues.
// ============================================================================
const COLLISION_RESOLUTION_MAP: Readonly<Record<string, Record<string, string>>> = Object.freeze({
    'kings': { nba: 'SAC', nhl: 'LAK', default: 'SAC' },
    'rangers': { mlb: 'TEX', nhl: 'NYR', default: 'NYR' },
    'giants': { nfl: 'NYG', mlb: 'SF', default: 'SF' },
    'panthers': { nfl: 'CAR', nhl: 'FLA', default: 'CAR' },
    'cardinals': { nfl: 'ARI', mlb: 'STL', default: 'STL' },
    'jets': { nfl: 'NYJ', nhl: 'WPG', default: 'NYJ' },
    'bucs': { nfl: 'TB', mlb: 'PIT', default: 'TB' }
});

// ============================================================================
// 2. Primary Canonical Dictionary
// Keys MUST be strictly normalized (lowercase, no punctuation, single spaces).
// ============================================================================
const TEAM_NAME_RESOLUTION_MAP: Readonly<Record<string, string>> = Object.freeze({
    // NBA
    'los angeles lakers': 'LAL', 'la lakers': 'LAL', 'lakers': 'LAL', 'lal': 'LAL',
    'new york knicks': 'NYK', 'ny knicks': 'NYK', 'knicks': 'NYK', 'nyk': 'NYK', 'knickerbockers': 'NYK',
    'oklahoma city thunder': 'OKC', 'okc thunder': 'OKC', 'thunder': 'OKC', 'okc': 'OKC',
    'golden state warriors': 'GSW', 'state warriors': 'GSW', 'warriors': 'GSW', 'gsw': 'GSW', 'dubs': 'GSW',
    'boston celtics': 'BOS', 'celtics': 'BOS', 'bos': 'BOS',
    'miami heat': 'MIA', 'heat': 'MIA', 'mia': 'MIA',
    'milwaukee bucks': 'MIL', 'bucks': 'MIL', 'mil': 'MIL',
    'chicago bulls': 'CHI', 'bulls': 'CHI', 'chi': 'CHI',
    'philadelphia 76ers': 'PHI', '76ers': 'PHI', 'sixers': 'PHI', 'philadelphia sixers': 'PHI', 'phi': 'PHI',
    'brooklyn nets': 'BKN', 'nets': 'BKN', 'bkn': 'BKN', 'nj nets': 'BKN', 'new jersey nets': 'BKN',
    'los angeles clippers': 'LAC', 'la clippers': 'LAC', 'clippers': 'LAC', 'lac': 'LAC',
    'phoenix suns': 'PHX', 'suns': 'PHX', 'phx': 'PHX',
    'dallas mavericks': 'DAL', 'mavericks': 'DAL', 'mavs': 'DAL', 'dal': 'DAL',
    'denver nuggets': 'DEN', 'nuggets': 'DEN', 'den': 'DEN',
    'atlanta hawks': 'ATL', 'hawks': 'ATL', 'atl': 'ATL',
    'charlotte hornets': 'CHA', 'hornets': 'CHA', 'cha': 'CHA',
    'cleveland cavaliers': 'CLE', 'cavaliers': 'CLE', 'cavs': 'CLE', 'cle': 'CLE',
    'detroit pistons': 'DET', 'pistons': 'DET', 'det': 'DET',
    'indiana pacers': 'IND', 'pacers': 'IND', 'ind': 'IND',
    'orlando magic': 'ORL', 'magic': 'ORL', 'orl': 'ORL',
    'toronto raptors': 'TOR', 'raptors': 'TOR', 'tor': 'TOR',
    'washington wizards': 'WAS', 'wizards': 'WAS', 'was': 'WAS',
    'houston rockets': 'HOU', 'rockets': 'HOU', 'hou': 'HOU',
    'memphis grizzlies': 'MEM', 'grizzlies': 'MEM', 'grizz': 'MEM', 'mem': 'MEM',
    'minnesota timberwolves': 'MIN', 'timberwolves': 'MIN', 'wolves': 'MIN', 'twolves': 'MIN', 'min': 'MIN',
    'new orleans pelicans': 'NOP', 'pelicans': 'NOP', 'pels': 'NOP', 'nop': 'NOP',
    'san antonio spurs': 'SAS', 'spurs': 'SAS', 'sas': 'SAS',
    'sacramento kings': 'SAC', 'sac': 'SAC',
    'portland trail blazers': 'POR', 'trail blazers': 'POR', 'blazers': 'POR', 'trailblazers': 'POR', 'por': 'POR',
    'utah jazz': 'UTA', 'jazz': 'UTA', 'uta': 'UTA',

    // MLB
    'new york yankees': 'NYY', 'ny yankees': 'NYY', 'yankees': 'NYY', 'yanks': 'NYY', 'nyy': 'NYY',
    'boston red sox': 'BOS', 'red sox': 'BOS', 'redsox': 'BOS', 'bosox': 'BOS',
    'los angeles dodgers': 'LAD', 'la dodgers': 'LAD', 'dodgers': 'LAD', 'lad': 'LAD',
    'san francisco giants': 'SF', 'sf giants': 'SF', 'sfg': 'SF', 'sf': 'SF',
    'new york mets': 'NYM', 'ny mets': 'NYM', 'mets': 'NYM', 'nym': 'NYM',
    'chicago cubs': 'CHC', 'cubs': 'CHC', 'chc': 'CHC',
    'atlanta braves': 'ATL', 'braves': 'ATL',
    'houston astros': 'HOU', 'astros': 'HOU', 'stros': 'HOU',
    'chicago white sox': 'CWS', 'white sox': 'CWS', 'whitesox': 'CWS', 'cws': 'CWS', 'chw': 'CWS',
    'cleveland guardians': 'CLE', 'guardians': 'CLE', 'indians': 'CLE',
    'detroit tigers': 'DET', 'tigers': 'DET',
    'kansas city royals': 'KC', 'royals': 'KC', 'kcr': 'KC', 'kc': 'KC',
    'minnesota twins': 'MIN', 'twins': 'MIN',
    'baltimore orioles': 'BAL', 'orioles': 'BAL', 'os': 'BAL', 'bal': 'BAL',
    'tampa bay rays': 'TB', 'rays': 'TB', 'tampabay rays': 'TB', 'tbr': 'TB', 'tb': 'TB',
    'toronto blue jays': 'TOR', 'blue jays': 'TOR', 'jays': 'TOR', 'bluejays': 'TOR',
    'oakland athletics': 'OAK', 'athletics': 'OAK', 'as': 'OAK', 'oakland as': 'OAK', 'oak': 'OAK',
    'los angeles angels': 'LAA', 'angels': 'LAA', 'la angels': 'LAA', 'laa': 'LAA',
    'seattle mariners': 'SEA', 'mariners': 'SEA', 'sea': 'SEA',
    'texas rangers': 'TEX', 'tex': 'TEX',
    'arizona diamondbacks': 'ARI', 'diamondbacks': 'ARI', 'dbacks': 'ARI', 'ari': 'ARI',
    'colorado rockies': 'COL', 'rockies': 'COL', 'rox': 'COL', 'col': 'COL',
    'san diego padres': 'SD', 'padres': 'SD', 'sdp': 'SD', 'sd': 'SD',
    'cincinnati reds': 'CIN', 'reds': 'CIN', 'cin': 'CIN',
    'milwaukee brewers': 'MIL', 'brewers': 'MIL', 'crew': 'MIL',
    'pittsburgh pirates': 'PIT', 'pirates': 'PIT', 'pit': 'PIT',
    'st louis cardinals': 'STL', 'st. louis cardinals': 'STL', 'cards': 'STL', 'stl': 'STL',
    'washington nationals': 'WSH', 'nationals': 'WSH', 'nats': 'WSH', 'wsh': 'WSH',
    'philadelphia phillies': 'PHI', 'phillies': 'PHI', 'phils': 'PHI',
    'miami marlins': 'MIA', 'marlins': 'MIA', 'florida marlins': 'MIA',

    // NFL
    'kansas city chiefs': 'KC', 'chiefs': 'KC',
    'san francisco 49ers': 'SF', '49ers': 'SF', 'niners': 'SF', 'sfo': 'SF',
    'dallas cowboys': 'DAL', 'cowboys': 'DAL',
    'philadelphia eagles': 'PHI', 'eagles': 'PHI',
    'buffalo bills': 'BUF', 'bills': 'BUF', 'buf': 'BUF',
    'new england patriots': 'NE', 'patriots': 'NE', 'pats': 'NE', 'ne': 'NE',
    'green bay packers': 'GB', 'packers': 'GB', 'gb': 'GB',
    'baltimore ravens': 'BAL', 'ravens': 'BAL',
    'cincinnati bengals': 'CIN', 'bengals': 'CIN',
    'cleveland browns': 'CLE', 'browns': 'CLE',
    'pittsburgh steelers': 'PIT', 'steelers': 'PIT',
    'houston texans': 'HOU', 'texans': 'HOU',
    'indianapolis colts': 'IND', 'colts': 'IND',
    'jacksonville jaguars': 'JAX', 'jaguars': 'JAX', 'jags': 'JAX', 'jax': 'JAX',
    'tennessee titans': 'TEN', 'titans': 'TEN', 'ten': 'TEN',
    'denver broncos': 'DEN', 'broncos': 'DEN',
    'las vegas raiders': 'LV', 'raiders': 'LV', 'oakland raiders': 'LV', 'lvr': 'LV', 'lv': 'LV',
    'los angeles chargers': 'LAC', 'la chargers': 'LAC', 'chargers': 'LAC', 'san diego chargers': 'LAC',
    'los angeles rams': 'LAR', 'la rams': 'LAR', 'rams': 'LAR', 'st louis rams': 'LAR', 'lar': 'LAR',
    'seattle seahawks': 'SEA', 'seahawks': 'SEA',
    'arizona cardinals': 'ARI',
    'chicago bears': 'CHI', 'bears': 'CHI',
    'detroit lions': 'DET', 'lions': 'DET',
    'minnesota vikings': 'MIN', 'vikings': 'MIN', 'vikes': 'MIN',
    'atlanta falcons': 'ATL', 'falcons': 'ATL',
    'carolina panthers': 'CAR', 'car': 'CAR',
    'new orleans saints': 'NO', 'saints': 'NO', 'no': 'NO',
    'tampa bay buccaneers': 'TB', 'buccaneers': 'TB',
    'washington commanders': 'WAS', 'commanders': 'WAS', 'washington football team': 'WAS', 'redskins': 'WAS',
    'new york giants': 'NYG', 'ny giants': 'NYG', 'nyg': 'NYG',
    'new york jets': 'NYJ', 'ny jets': 'NYJ', 'nyj': 'NYJ',

    // NHL
    'vegas golden knights': 'VGK', 'golden knights': 'VGK', 'vegas': 'VGK', 'vgk': 'VGK',
    'new york rangers': 'NYR', 'ny rangers': 'NYR', 'nyr': 'NYR',
    'new york islanders': 'NYI', 'ny islanders': 'NYI', 'islanders': 'NYI', 'isles': 'NYI', 'nyi': 'NYI',
    'edmonton oilers': 'EDM', 'oilers': 'EDM', 'edm': 'EDM',
    'boston bruins': 'BOS', 'bruins': 'BOS',
    'toronto maple leafs': 'TOR', 'maple leafs': 'TOR', 'leafs': 'TOR',
    'carolina hurricanes': 'CAR', 'hurricanes': 'CAR', 'canes': 'CAR',
    'florida panthers': 'FLA', 'fla': 'FLA',
    'tampa bay lightning': 'TB', 'lightning': 'TB', 'bolts': 'TB', 'tbl': 'TB',
    'montreal canadiens': 'MTL', 'canadiens': 'MTL', 'habs': 'MTL', 'mtl': 'MTL',
    'ottawa senators': 'OTT', 'senators': 'OTT', 'sens': 'OTT', 'ott': 'OTT',
    'detroit red wings': 'DET', 'red wings': 'DET', 'redwings': 'DET', 'wings': 'DET',
    'chicago blackhawks': 'CHI', 'blackhawks': 'CHI',
    'minnesota wild': 'MIN', 'wild': 'MIN',
    'nashville predators': 'NSH', 'predators': 'NSH', 'preds': 'NSH', 'nsh': 'NSH',
    'st louis blues': 'STL', 'blues': 'STL',
    'winnipeg jets': 'WPG', 'wpg': 'WPG',
    'calgary flames': 'CGY', 'flames': 'CGY', 'cgy': 'CGY',
    'vancouver canucks': 'VAN', 'canucks': 'VAN', 'nucks': 'VAN', 'van': 'VAN',
    'los angeles kings': 'LAK', 'la kings': 'LAK', 'lak': 'LAK',
    'san jose sharks': 'SJS', 'sharks': 'SJS', 'sjs': 'SJS',
    'seattle kraken': 'SEA', 'kraken': 'SEA',
    'anaheim ducks': 'ANA', 'ducks': 'ANA', 'ana': 'ANA',
    'buffalo sabres': 'BUF', 'sabres': 'BUF',
    'columbus blue jackets': 'CBJ', 'blue jackets': 'CBJ', 'jackets': 'CBJ', 'cbj': 'CBJ',
    'new jersey devils': 'NJD', 'devils': 'NJD', 'njd': 'NJD',
    'philadelphia flyers': 'PHI', 'flyers': 'PHI',
    'pittsburgh penguins': 'PIT', 'penguins': 'PIT', 'pens': 'PIT',
    'washington capitals': 'WSH', 'capitals': 'WSH', 'caps': 'WSH',
    'colorado avalanche': 'COL', 'avalanche': 'COL', 'avs': 'COL',
    'dallas stars': 'DAL', 'stars': 'DAL',
    'utah hockey club': 'UTA', 'utah hc': 'UTA', 'arizona coyotes': 'UTA', 'coyotes': 'UTA'
});

// Sort keys by length descending. This ensures "Los Angeles Lakers" matches
// before "Lakers" is evaluated in the fallback logic.
const SORTED_RESOLUTION_KEYS = Object.keys(TEAM_NAME_RESOLUTION_MAP).sort((a, b) => b.length - a.length);

// ============================================================================
// Zero-Dependency LRU Cache (Event Loop Protection)
// ============================================================================
const resolutionCache = new Map<string, string>();
const CACHE_LIMIT = 5000;

/**
 * Clinically normalizes input strings to guarantee deterministic cache hits.
 * Example: "A's" -> "as", "St. Louis" -> "st louis", "L.A. Lakers" -> "la lakers"
 */
function normalizeIdentifier(input: string): string {
    return input
        .toLowerCase()
        .replace(/[.,'()\-]/g, '')   // Strip punctuation
        .replace(/\bthe\b/g, '')     // Remove definitive articles ("the lakers" -> "lakers")
        .replace(/\bl a\b/g, 'la')   // Normalize L.A. spacing variants
        .replace(/\bny\b/g, 'ny')    // Normalize N.Y. spacing variants
        .replace(/\s+/g, ' ')        // Collapse multiple spaces
        .trim();
}

/**
 * Deterministically resolves arbitrary team names, locations, or aliases 
 * to their standardized 3-letter sports data abbreviations.
 * 
 * @param inputNameOrAbbr - The raw string to resolve (e.g. "The L.A. Lakers", "Cavs", "nyy")
 * @param options - Contextual options (league scoping for collision handling)
 * @returns The uppercase canonical abbreviation, or a graceful fallback if no match is found.
 */
export function resolveTeamAbbreviation(inputNameOrAbbr: string, options: ResolutionOptions = {}): string {
    if (!inputNameOrAbbr || typeof inputNameOrAbbr !== 'string') return '';

    const normalizedLookup = normalizeIdentifier(inputNameOrAbbr);
    if (!normalizedLookup) return '';

    const normalizedLeague = options.league ? normalizeIdentifier(options.league) : 'none';
    const cacheKey = `${normalizedLeague}::${normalizedLookup}`;

    if (resolutionCache.has(cacheKey)) {
        return resolutionCache.get(cacheKey)!;
    }

    let resolvedAbbr: string | null = null;

    // 1. Cross-League Disambiguation Check
    if (COLLISION_RESOLUTION_MAP[normalizedLookup]) {
        const potentialCollision = COLLISION_RESOLUTION_MAP[normalizedLookup];
        resolvedAbbr = potentialCollision[normalizedLeague] || potentialCollision['default'];
    }

    // 2. Exact O(1) Dictionary Match
    if (!resolvedAbbr && TEAM_NAME_RESOLUTION_MAP[normalizedLookup]) {
        resolvedAbbr = TEAM_NAME_RESOLUTION_MAP[normalizedLookup];
    }

    // 3. Bi-Directional Word-Boundary Regex Match (The Substring Fix)
    // Eliminates dangerous `.includes()`. Safely intercepts "LA" routing to "LA Lakers" 
    // without accidentally matching the substring inside "portLAnd".
    if (!resolvedAbbr && normalizedLookup.length >= 2) {
        
        // A: Does the user input contain a known alias perfectly? 
        // Example: "The philadelphia eagles football team" -> Contains "\bphiladelphia eagles\b"
        for (const key of SORTED_RESOLUTION_KEYS) {
            if (key.length < 3) continue; // Skip hyper-generic 2-char aliases in fallback
            
            const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const boundaryRegex = new RegExp(`\\b${escapedKey}\\b`, 'i');
            
            if (boundaryRegex.test(normalizedLookup)) {
                if (COLLISION_RESOLUTION_MAP[key]) {
                    resolvedAbbr = COLLISION_RESOLUTION_MAP[key][normalizedLeague] || COLLISION_RESOLUTION_MAP[key]['default'];
                     break;
                }
                resolvedAbbr = TEAM_NAME_RESOLUTION_MAP[key];
                break;
            }
        }

        // B: Does a known alias contain the user input perfectly?
        // Example: User types "timberwolves" -> Matches "\btimberwolves\b" inside "minnesota timberwolves"
        if (!resolvedAbbr && normalizedLookup.length >= 3) {
            const escapedLookup = normalizedLookup.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const inputRegex = new RegExp(`\\b${escapedLookup}\\b`, 'i');
            
            for (const key of SORTED_RESOLUTION_KEYS) {
                if (inputRegex.test(key)) {
                    resolvedAbbr = TEAM_NAME_RESOLUTION_MAP[key];
                    break;
                }
            }
        }
    }

    // 4. Graceful Degradation
    let finalResult = '';
    if (resolvedAbbr) {
        finalResult = resolvedAbbr;
    } else if (options.fallbackToInput !== false) {
        finalResult = inputNameOrAbbr.trim().substring(0, 4).toUpperCase();
    }

    // 5. LRU Cache Maintenance (O(1) clear for speed)
    if (resolutionCache.size >= CACHE_LIMIT) {
        resolutionCache.clear();
    }
    
    if (finalResult) {
        resolutionCache.set(cacheKey, finalResult);
    }

    return finalResult;
}

export function resolveLeagueFromTeamName(input: string): string | null {
    if (!input) return null;
    const l = input.toLowerCase();
    
    // NBA
    const nbaKeywords = [
        'lakers', 'knicks', 'thunder', 'warriors', 'celtics', 'heat', 'bucks', 'bulls', '76ers', 'sixers', 
        'nets', 'clippers', 'suns', 'mavericks', 'mavs', 'nuggets', 'hawks', 'hornets', 'cavaliers', 'cavs', 
        'pistons', 'pacers', 'magic', 'raptors', 'wizards', 'rockets', 'grizzlies', 'grizz', 'timberwolves', 
        'wolves', 'twolves', 'pelicans', 'pels', 'spurs', 'kings', 'blazers', 'trail blazers', 'jazz', 'lal', 
        'nyk', 'okc', 'gsw', 'bos', 'mia', 'mil', 'chi', 'phi', 'bkn', 'lac', 'phx', 'dal', 'den', 'atl', 'cha', 
        'cle', 'det', 'ind', 'orl', 'tor', 'was', 'hou', 'mem', 'min', 'nop', 'sas', 'sac', 'por', 'uta'
    ];
    // MLB
    const mlbKeywords = [
        'yankees', 'yanks', 'nyy', 'red sox', 'redsox', 'dodgers', 'lad', 'giants', 'mets', 'nym', 'cubs', 'chc', 
        'braves', 'astros', 'stros', 'white sox', 'whitesox', 'cws', 'guardians', 'indians', 'tigers', 'royals', 
        'twins', 'orioles', 'os', 'rays', 'blue jays', 'bluejays', 'athletics', 'seattle', 'mariners', 'rangers', 
        'diamondbacks', 'dbacks', 'rockies', 'padres', 'reds', 'brewers', 'pirates', 'cardinals', 'nationals', 
        'nats', 'phillies', 'marlins', 'sfg', 'sf', 'chw', 'kcr', 'kc', 'bal', 'tbr', 'tb', 'oak', 'laa', 'angels', 
        'sea', 'tex', 'ari', 'col', 'sdp', 'sd', 'cin', 'pit', 'stl', 'wsh', 'phils'
    ];
    // NFL
    const nflKeywords = [
        'chiefs', '49ers', 'niners', 'cowboys', 'eagles', 'bills', 'ravens', 'lions', 'packers', 'texans', 
        'dolphins', 'browns', 'buccaneers', 'bucs', 'steelers', 'rams', 'seahawks', 'jaguars', 'jags', 'saints', 
        'colts', 'raiders', 'broncos', 'chargers', 'patriots', 'pats', 'cardinals', 'giants', 'bears', 'titans', 
        'panthers', 'falcons', 'commanders', 'vikings', 'jets'
    ];
    // NHL
    const nhlKeywords = [
        'oilers', 'panthers', 'stars', 'rangers', 'hurricanes', 'canucks', 'bruins', 'avalanche', 'avs', 'knights', 
        'golden knights', 'lightning', 'bolts', 'maple leafs', 'leafs', 'kings', 'islanders', 'capitals', 'caps', 
        'predators', 'preds', 'jets', 'flyers', 'wild', 'devils', 'red wings', 'wings', 'sabres', 'senators', 
        'sens', 'coyotes', 'canadiens', 'habs', 'blues', 'kraken', 'flames', 'ducks', 'blackhawks', 'hawks', 
        'sharks'
    ];

    for (const kw of nbaKeywords) {
        if (l.includes(kw)) return 'nba';
    }
    for (const kw of mlbKeywords) {
        if (l.includes(kw)) return 'mlb';
    }
    for (const kw of nflKeywords) {
        if (l.includes(kw)) return 'nfl';
    }
    for (const kw of nhlKeywords) {
        if (l.includes(kw)) return 'nhl';
    }
    return null;
}
