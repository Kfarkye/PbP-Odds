import React, { useState, useEffect } from 'react';
import { SofaScoreMatchupCard, ReadonlySofaScoreLiveState } from './SofaScoreMatchupCard';

export function LiveSofaScoreWidget({ gameId = "mlb_sd_phi" }: { gameId?: string }) {
    const [liveState, setLiveState] = useState<ReadonlySofaScoreLiveState>({
        gameId,
        gameState: 'Awaiting Pitch',
        momentumHistory: [],
        awayTeamBox: {
            team: { id: 'sd', abbreviation: 'SD', displayName: 'San Diego', logo: '' },
            runs: 0, hits: 0, errors: 0
        },
        homeTeamBox: {
            team: { id: 'phi', abbreviation: 'PHI', displayName: 'Philadelphia', logo: '' },
            runs: 0, hits: 0, errors: 0
        },
        situation: {
            outs: 0, balls: 0, strikes: 0
        }
    });

    useEffect(() => {
        let eventSource: EventSource | null = null;
        let pbpCache: any[] = [];

        const connect = () => {
            if (eventSource) eventSource.close();
            eventSource = new EventSource(`/api/stream/${gameId}`);

            eventSource.addEventListener('message', (event) => {
                try {
                    const parsed = JSON.parse(event.data);
                    if (parsed.type === 'PBP_TICK') {
                        const play = parsed.data;
                        pbpCache = [play, ...pbpCache].slice(0, 50);
                        
                        setLiveState(prev => {
                            const newMomentum = pbpCache.map(p => p.wpa).reverse();
                            // Very basic parsing for demo / live update purposes
                            let balls = prev.situation?.balls ?? 0;
                            let strikes = prev.situation?.strikes ?? 0;
                            let outs = prev.situation?.outs ?? 0;

                            const descLower = play.description.toLowerCase();
                            if (descLower.includes('strike')) strikes = Math.min(2, strikes + 1);
                            if (descLower.includes('ball')) balls = Math.min(3, balls + 1);
                            if (descLower.includes('out')) {
                                outs = Math.min(3, outs + 1);
                                if (outs === 3) {
                                    outs = 0; balls = 0; strikes = 0;
                                }
                            }
                            if (descLower.includes('hit') || descLower.includes('walk') || descLower.includes('homers')) {
                                balls = 0; strikes = 0;
                            }

                            return {
                                ...prev,
                                gameState: play.clock,
                                situation: {
                                    outs, balls, strikes,
                                    batter: { displayName: "Active Batter" },
                                    pitcher: { displayName: "Active Pitcher" }
                                },
                                momentumHistory: newMomentum,
                                homeTeamBox: { ...prev.homeTeamBox!, runs: play.homeScore },
                                awayTeamBox: { ...prev.awayTeamBox!, runs: play.awayScore },
                            };
                        });
                    }
                } catch (err) {}
            });

            eventSource.onerror = () => {
                eventSource?.close();
                setTimeout(connect, 5000);
            };
        };

        connect();
        return () => { if (eventSource) eventSource.close(); };
    }, [gameId]);

    return (
        <div className="w-full max-w-[800px] mx-auto">
            <SofaScoreMatchupCard 
                data={liveState} 
                onMount={(id, ts) => console.log(`[Telemetry] Mounted ${id} at ${ts}`)}
                onInteraction={(action, meta) => console.log(`[Telemetry] ${action}`, meta)}
            />
        </div>
    );
}
