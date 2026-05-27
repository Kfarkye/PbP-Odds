import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { googleSignIn, logout, getGithubToken, githubSignIn } from '../firebase'; // Assuming githubSignIn is available
import { 
    ShieldCheck, AlertTriangle, Wifi, XCircle, Loader, User, Zap, Lock, Unlock, RefreshCw, Info, Check, Github
} from 'lucide-react'; // Added Github icon

export const GithubConnectionBlueprint: React.FC = () => {
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
    
    const [githubUser, setGithubUser] = useState<string | null>(null);
    const [oauthScopes, setOauthScopes] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Refs for AbortController to cancel ongoing fetch requests
    const testAbortControllerRef = useRef<AbortController | null>(null);
    const userDataAbortControllerRef = useRef<AbortController | null>(null);

    // Cleanup abort controllers on component unmount
    useEffect(() => {
        return () => {
            testAbortControllerRef.current?.abort();
            userDataAbortControllerRef.current?.abort();
        };
    }, []);

    // Function to fetch GitHub user data (memoized and cancellable)
    const fetchGithubData = useCallback(async (token: string) => {
        userDataAbortControllerRef.current?.abort(); // Abort any previous user data fetch
        userDataAbortControllerRef.current = new AbortController();
        const signal = userDataAbortControllerRef.current.signal;

        setErrorMessage(null); // Clear previous errors
        try {
            const response = await fetch('https://api.github.com/user', {
                headers: {
                    Authorization: `Bearer ${token}`
                },
                signal: signal // Attach abort signal
            });
            if (response.ok) {
                const data = await response.json();
                setGithubUser(data.login);
                
                // Read actual OAuth scopes from GitHub's response header
                const scopes = response.headers.get('x-oauth-scopes');
                setOauthScopes(scopes || 'No scopes provided');
                setConnectionStatus('connected'); // Explicitly set connected status on success
                return true; // Indicate success
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || `Failed to fetch user info: HTTP ${response.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("Fetch GitHub user data aborted.");
                return false; // Request was intentionally cancelled
            }
            console.error("Failed to fetch GitHub data:", error);
            setErrorMessage(`User data fetch failed: ${error.message}`);
            setConnectionStatus('error'); // Set error status on failure
            setGithubUser(null);
            setOauthScopes(null);
            return false; // Indicate failure
        }
    }, []); // No external dependencies needed for this useCallback's internal logic

    // Effect to check initial authentication status on mount
    useEffect(() => {
        const checkAuth = async () => {
            setConnectionStatus('connecting'); // Show connecting state during initial check
            const token = await getGithubToken();
            if (token) {
                const success = await fetchGithubData(token);
                if (!success) {
                    // If fetchGithubData was aborted or failed, ensure status reflects it
                    setConnectionStatus('error'); 
                }
            } else {
                setConnectionStatus('disconnected');
            }
        };
        checkAuth();
    }, [fetchGithubData]); // `fetchGithubData` is a stable useCallback, so it's safe here

    // Handler for initiating connection
    const handleConnect = useCallback(async () => {
        setConnectionStatus('connecting');
        setErrorMessage(null);
        try {
            const res = await githubSignIn(); // Assuming githubSignIn is available
            if (res && res.accessToken) {
                await fetchGithubData(res.accessToken); // fetchGithubData will handle setting status
            } else {
                throw new Error("Authentication process did not return an access token.");
            }
        } catch (error: any) {
            console.error("Failed to connect GitHub:", error);
            let specificErrorMessage = "A connection error occurred during OAuth negotiation.";
            if (error.code === 'auth/operation-not-allowed') {
                specificErrorMessage = "GitHub Authentication is disabled in your Firebase console. Please enable it under Authentication > Sign-in method.";
            } else if (error.message && error.message.includes('auth/unauthorized-domain')) {
                specificErrorMessage = `Please add ${window.location.hostname} to your Authorized Domains in the Firebase console.`;
            } else if (error.code === 'auth/popup-closed-by-user') {
                specificErrorMessage = "Authentication window was closed by the user.";
            } else if (error.message) {
                specificErrorMessage = error.message;
            }
            setErrorMessage(`Connection failed: ${specificErrorMessage}`);
            setConnectionStatus('error');
        }
    }, [fetchGithubData]);

    // Handler for disconnecting
    const handleDisconnect = useCallback(async () => {
        setConnectionStatus('connecting'); // Show connecting state during disconnect
        setErrorMessage(null);
        try {
            await logout(); // Assuming logout clears GitHub session too
            setConnectionStatus('disconnected');
            setGithubUser(null);
            setOauthScopes(null);
            setTestStatus('idle'); // Reset test status on disconnect
        } catch (error: any) {
            console.error("Failed to disconnect:", error);
            setErrorMessage(`Disconnect failed: ${error.message}`);
            setConnectionStatus('error');
        }
    }, []);

    // Handler for testing the connection (cancellable and refined timing)
    const handleTest = useCallback(async () => {
        testAbortControllerRef.current?.abort(); // Abort any previous test fetch
        testAbortControllerRef.current = new AbortController();
        const signal = testAbortControllerRef.current.signal;

        setTestStatus('testing');
        setErrorMessage(null);
        let timer: NodeJS.Timeout | null = null; // For clearing the success/failed message

        try {
            const token = await getGithubToken();
            if (!token) throw new Error("No active GitHub token found.");
            
            const response = await fetch('https://api.github.com/user', {
                headers: { Authorization: `Bearer ${token}` },
                signal: signal // Attach abort signal
            });

            if (response.ok) {
                setTestStatus('success');
                const data = await response.json();
                setGithubUser(data.login); // Refresh user info
                const scopes = response.headers.get('x-oauth-scopes');
                setOauthScopes(scopes || 'No scopes provided');
            } else {
                const errorData = await response.json();
                throw new Error(errorData.message || `API responded with HTTP ${response.status}`);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                console.log("Connection test aborted.");
                setTestStatus('idle'); // Immediately reset if aborted
                return; 
            }
            console.error("Connection test failed:", error);
            setTestStatus('failed');
            setErrorMessage(`Test failed: ${error.message}`);
        } finally {
            // Clear the success/failed message after a delay
            timer = setTimeout(() => setTestStatus('idle'), 3000);
        }
        // Ensure timer is cleared if component unmounts
        return () => { if (timer) clearTimeout(timer); };
    }, []);

    // Memoized display for overall connection status
    const getStatusDisplay = useMemo(() => {
        switch (connectionStatus) {
            case 'connected': return { text: 'INTEGRITY_ONLINE', color: 'text-emerald-400', icon: <Wifi className="w-4 h-4" /> };
            case 'connecting': return { text: 'HANDSHAKE_PENDING', color: 'text-amber-400', icon: <Loader className="w-4 h-4 animate-spin" /> };
            case 'disconnected': return { text: 'DISCONNECTED', color: 'text-neutral-500', icon: <XCircle className="w-4 h-4" /> };
            case 'error': return { text: 'CONNECTION_FAULT', color: 'text-rose-500', icon: <AlertTriangle className="w-4 h-4" /> };
            default: return { text: 'UNKNOWN_STATE', color: 'text-neutral-600', icon: <Info className="w-4 h-4" /> };
        }
    }, [connectionStatus]);

    // Memoized display for test result status
    const getTestResultDisplay = useMemo(() => {
        switch (testStatus) {
            case 'testing': return { text: 'DISPATCHING_DIAGNOSTICS_PROBE...', color: 'text-amber-400', icon: <RefreshCw className="w-4 h-4 animate-spin" /> };
            case 'success': return { text: 'STATUS_OK: MUTUAL TRUST HANDSHAKE VERIFIED', color: 'text-emerald-400', icon: <Check className="w-4 h-4" /> };
            case 'failed': return { text: 'EXCEPTION: ACCESS TOKEN REJECTED', color: 'text-rose-500', icon: <XCircle className="w-4 h-4" /> };
            default: return null;
        }
    }, [testStatus]);

    // Helper for dynamic Tailwind classes for test result background (more robust)
    const getTestResultBgClass = useMemo(() => {
        switch (testStatus) {
            case 'success': return 'bg-emerald-950/20 border-emerald-900/40';
            case 'failed': return 'bg-rose-950/20 border-rose-900/40';
            case 'testing': return 'bg-amber-950/20 border-amber-900/40';
            default: return '';
        }
    }, [testStatus]);

    const isInteractive = connectionStatus !== 'connecting' && testStatus !== 'testing';

    return (
        <div className="bg-neutral-950 border border-white/[0.05] rounded-xl p-6 max-w-md mx-auto w-full font-mono text-[11px] text-neutral-400 tracking-wide my-4 select-none shadow-[0_16px_32px_rgba(0,0,0,0.6)]">
            {/* Header / Module Identifier */}
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
                <span className="text-neutral-200 font-medium flex items-center gap-2">
                    <Github className="w-4 h-4 text-neutral-300" />
                    [PROV] GITHUB_WORKSPACE_SYNC
                </span>
                <span className="text-[10px] text-neutral-600">v1.4.2</span>
            </div>

            {/* Error Message Display */}
            <AnimatePresence>
                {errorMessage && (
                    <motion.div
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="bg-rose-950/20 border border-rose-900/40 text-rose-300 px-4 py-3 rounded-lg mb-4 flex items-start gap-3"
                        role="alert"
                        aria-live="assertive"
                    >
                        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                        <div className="flex flex-col">
                            <h4 className="font-medium text-[12px] mb-0.5">Authentication Fault</h4>
                            <p className="text-[11px] font-mono leading-relaxed text-rose-400/80">{errorMessage}</p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Matrix Data Area */}
            <div className="space-y-4">
                <div className="grid grid-cols-[120px_1fr] gap-y-2.5 pb-4 border-b border-white/[0.08]">
                    <span className="text-neutral-500 uppercase">SYS_STATUS</span>
                    <span className={`font-medium flex items-center gap-2 ${getStatusDisplay.color}`}>
                        {getStatusDisplay.icon}
                        {getStatusDisplay.text}
                    </span>

                    <span className="text-neutral-500 uppercase">PROV_SCHEME</span>
                    <span className="text-neutral-200">OAUTH_READ_ONLY</span>

                    <span className="text-neutral-500 uppercase">ENCRYPTION</span>
                    <span className="text-neutral-200">GSM_V1_MANAGED</span>

                    <span className="text-neutral-500 uppercase">TUNNEL</span>
                    <span className="text-neutral-200">PENDING_AUTH</span>
                </div>

                {connectionStatus !== 'connected' ? (
                    <>
                        <div className="text-[10px] text-neutral-600 leading-relaxed bg-neutral-900/50 p-3 border border-white/[0.06] rounded-lg">
                            Cryptographic handshake with GitHub ensures zero-leak security. Establishes strictly read-only capabilities for static analysis and architectural structural verification.
                        </div>

                        <motion.button
                            onClick={handleConnect}
                            disabled={!isInteractive}
                            className="w-full text-center border border-white/[0.15] hover:border-white/[0.3] text-white bg-transparent py-2.5 px-4 transition-all duration-300 font-mono text-[11px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.99 }}
                        >
                            {connectionStatus === 'connecting' ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader className="w-4 h-4 animate-spin" />
                                    [ NEGOTIATING HANDSHAKE... ]
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    [ INITIALIZE CONNECTION ]
                                </span>
                            )}
                        </motion.button>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-[120px_1fr] gap-y-2.5 pb-4 border-b border-white/[0.08]">
                            <span className="text-neutral-500 uppercase">IDENT_ID</span>
                            <span className="text-neutral-200 truncate" title={githubUser || 'UNKNOWN'}>
                                <span className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-neutral-500" />
                                    {githubUser ? githubUser.toUpperCase() : 'RESOLVING...'}
                                </span>
                            </span>

                            <span className="text-neutral-500 uppercase">OAUTH_SCOPES</span>
                            <span className="text-neutral-200 truncate" title={oauthScopes || 'FETCH_PENDING'}>
                                <span className="flex items-center gap-2">
                                    <ShieldCheck className="w-4 h-4 text-neutral-500" />
                                    {oauthScopes ? oauthScopes.toUpperCase() : 'FETCH_PENDING'}
                                </span>
                            </span>

                            <span className="text-neutral-500 uppercase">VAULT_KEY</span>
                            <span className="text-neutral-200">GSM_V1_HOT_RELOAD</span>

                            <span className="text-neutral-500 uppercase">SECURITY</span>
                            <span className="text-emerald-400">VAULT_LOCK_ON</span>
                        </div>

                        {getTestResultDisplay && (
                            <motion.div
                                initial={{ opacity: 0, y: -5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -5 }}
                                className={`px-4 py-2 rounded-lg text-[11px] text-center flex items-center justify-center gap-2 ${getTestResultBgClass} ${getTestResultDisplay.color}`}
                                role="status"
                                aria-live="polite"
                            >
                                {getTestResultDisplay.icon}
                                <span className="font-medium">{getTestResultDisplay.text}</span>
                            </motion.div>
                        )}

                        <div className="grid grid-cols-2 gap-3">
                            <motion.button 
                                onClick={handleTest}
                                disabled={!isInteractive}
                                className="text-center border border-neutral-700 hover:border-neutral-500 hover:text-neutral-200 text-neutral-400 bg-transparent py-2.5 px-3 transition-all duration-300 font-mono text-[10px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                            >
                                {testStatus === 'testing' ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        [ RUNNING TEST ]
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Zap className="w-4 h-4" />
                                        [ RUN ENDPOINT TEST ]
                                    </span>
                                )}
                            </motion.button>
                            <motion.button 
                                onClick={handleDisconnect} 
                                disabled={!isInteractive}
                                className="text-center border border-rose-900/40 hover:border-rose-700 hover:bg-rose-950/20 text-rose-500 bg-transparent py-2.5 px-3 transition-all duration-300 font-mono text-[10px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                                whileHover={{ scale: 1.01 }}
                                whileTap={{ scale: 0.99 }}
                            >
                                <span className="flex items-center justify-center gap-2">
                                    <Unlock className="w-4 h-4" />
                                    [ TEAR DOWN ]
                                </span>
                            </motion.button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};
