import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { googleSignIn, logout, getAccessToken } from '../firebase';
import { 
    ShieldCheck, AlertTriangle, Wifi, XCircle, Loader, User, Zap, Lock, Unlock, RefreshCw, Info, Check
} from 'lucide-react';

const API_TIMEOUT_MS = 10000; // 10 seconds strict timeout
const GOOGLE_API_ENDPOINT = 'https://www.googleapis.com/oauth2/v3/userinfo';

export const FirebaseConnectionBlueprint: React.FC = () => {
    const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
    const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'failed'>('idle');
    
    const [googleUserEmail, setGoogleUserEmail] = useState<string | null>(null);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    // Refs for network controllers and timers to prevent memory leaks
    const testAbortControllerRef = useRef<AbortController | null>(null);
    const userDataAbortControllerRef = useRef<AbortController | null>(null);
    const testTimerRef = useRef<NodeJS.Timeout | null>(null);
    const isMounted = useRef<boolean>(true);

    // Strict cleanup on component unmount
    useEffect(() => {
        isMounted.current = true;
        return () => {
            isMounted.current = false;
            testAbortControllerRef.current?.abort();
            userDataAbortControllerRef.current?.abort();
            if (testTimerRef.current) clearTimeout(testTimerRef.current);
        };
    }, []);

    // Core API Wrapper: DRY, Cancellable, Time-bound, and Crash-safe
    const executeGoogleApiCall = useCallback(async (token: string, controllerRef: React.MutableRefObject<AbortController | null>) => {
        controllerRef.current?.abort();
        controllerRef.current = new AbortController();
        const signal = controllerRef.current.signal;

        // Explicit timeout to prevent hanging requests on bad networks
        const timeoutId = setTimeout(() => {
            controllerRef.current?.abort();
        }, API_TIMEOUT_MS);

        try {
            const response = await fetch(GOOGLE_API_ENDPOINT, {
                headers: { Authorization: `Bearer ${token}` },
                signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                if (response.status === 401) throw new Error("AUTH_EXPIRED");
                
                // Safely parse potentially non-JSON error pages (like 502 Gateway Timeout HTML pages)
                const contentType = response.headers.get("content-type");
                let errorDetails = `HTTP ${response.status}`;
                if (contentType?.includes("application/json")) {
                    const errorData = await response.json().catch(() => ({}));
                    errorDetails = errorData.error_description || errorData.error?.message || errorDetails;
                }
                throw new Error(`API Fault: ${errorDetails}`);
            }

            return await response.json();
        } catch (error: unknown) {
            clearTimeout(timeoutId);
            throw error;
        }
    }, []);

    const fetchGoogleUserData = useCallback(async (token: string) => {
        setErrorMessage(null);
        try {
            const data = await executeGoogleApiCall(token, userDataAbortControllerRef);
            
            if (isMounted.current) {
                setGoogleUserEmail(data.email || data.name);
                setConnectionStatus('connected');
            }
            return true;
        } catch (error: any) {
            if (error.name === 'AbortError') return false; // Ignore intentional aborts

            if (isMounted.current) {
                console.error("[Auth] User data fetch failed:", error);
                
                if (error.message === 'AUTH_EXPIRED') {
                    setErrorMessage("Session expired. Please initialize the secure tunnel again.");
                    setConnectionStatus('disconnected'); // Gracefully downgrade state to allow re-auth
                } else {
                    setErrorMessage(error.message || "Connection timed out. Network unstable.");
                    setConnectionStatus('error');
                }
                
                setGoogleUserEmail(null);
            }
            return false;
        }
    }, [executeGoogleApiCall]);

    useEffect(() => {
        const checkAuth = async () => {
            setConnectionStatus('connecting');
            try {
                const token = await getAccessToken();
                if (!isMounted.current) return;

                if (token) {
                    await fetchGoogleUserData(token);
                } else {
                    setConnectionStatus('disconnected');
                }
            } catch (error: any) {
                if (isMounted.current) {
                    console.error("[Auth] Initial check failed:", error);
                    setConnectionStatus('error');
                    setErrorMessage("Failed to read local secure frame credentials.");
                }
            }
        };
        checkAuth();
    }, [fetchGoogleUserData]);

    const handleConnect = useCallback(async () => {
        setConnectionStatus('connecting');
        setErrorMessage(null);
        try {
            const res = await googleSignIn();
            if (res?.accessToken) {
                await fetchGoogleUserData(res.accessToken);
            } else {
                throw new Error("Handshake successful, but token payload was empty.");
            }
        } catch (error: any) {
            if (isMounted.current) {
                console.error("[Auth] Connection failed:", error);
                // Handle user intentionally closing popup gracefully
                const msg = error.code === 'auth/popup-closed-by-user' 
                    ? "User aborted the secure handshake." 
                    : `Connection failed: ${error.message}`;
                setErrorMessage(msg);
                setConnectionStatus('error');
            }
        }
    }, [fetchGoogleUserData]);

    const handleDisconnect = useCallback(async () => {
        setConnectionStatus('connecting');
        setErrorMessage(null);
        try {
            await logout();
            if (isMounted.current) {
                setConnectionStatus('disconnected');
                setGoogleUserEmail(null);
                setTestStatus('idle');
            }
        } catch (error: any) {
            if (isMounted.current) {
                console.error("[Auth] Teardown failed:", error);
                setErrorMessage(`Teardown failed: ${error.message}`);
                setConnectionStatus('error');
            }
        }
    }, []);

    const handleTest = useCallback(async () => {
        if (testTimerRef.current) clearTimeout(testTimerRef.current);
        
        setTestStatus('testing');
        setErrorMessage(null);

        try {
            const token = await getAccessToken();
            if (!token) throw new Error("No active credentials found in vault.");
            
            const data = await executeGoogleApiCall(token, testAbortControllerRef);
            
            if (isMounted.current) {
                setTestStatus('success');
                setGoogleUserEmail(data.email || data.name);
            }
        } catch (error: any) {
            if (error.name === 'AbortError') {
                if (isMounted.current) setTestStatus('idle');
                return; 
            }
            if (isMounted.current) {
                console.error("[Auth] Test failed:", error);

                if (error.message === 'AUTH_EXPIRED') {
                    setTestStatus('failed');
                    setErrorMessage("Access token rejected. Trust revoked. Please tear down and reconnect.");
                    setConnectionStatus('disconnected'); // Force user to re-auth
                } else {
                    setTestStatus('failed');
                    setErrorMessage(error.message || "Test timed out. Network unstable.");
                }
            }
        } finally {
            if (isMounted.current) {
                testTimerRef.current = setTimeout(() => {
                    // Only reset if it isn't currently mid-test from a rapid double-click
                    if (isMounted.current) setTestStatus(prev => prev !== 'testing' ? 'idle' : prev);
                }, 3000);
            }
        }
    }, [executeGoogleApiCall]);

    // --- UI Logic (Remains identical to your beautifully styled implementation) ---

    const getStatusDisplay = useMemo(() => {
        switch (connectionStatus) {
            case 'connected': return { text: 'INTEGRITY_ONLINE', color: 'text-emerald-400', icon: <Wifi className="w-4 h-4" /> };
            case 'connecting': return { text: 'HANDSHAKE_PENDING', color: 'text-amber-400', icon: <Loader className="w-4 h-4 animate-spin" /> };
            case 'disconnected': return { text: 'DISCONNECTED', color: 'text-neutral-500', icon: <XCircle className="w-4 h-4" /> };
            case 'error': return { text: 'CONNECTION_FAULT', color: 'text-rose-500', icon: <AlertTriangle className="w-4 h-4" /> };
            default: return { text: 'UNKNOWN_STATE', color: 'text-neutral-600', icon: <Info className="w-4 h-4" /> };
        }
    }, [connectionStatus]);

    const getTestResultDisplay = useMemo(() => {
        switch (testStatus) {
            case 'testing': return { text: 'VALIDATING_PROTOCOL...', color: 'text-amber-400', icon: <RefreshCw className="w-4 h-4 animate-spin" /> };
            case 'success': return { text: 'STATUS_OK: MUTUAL TRUST ESTABLISHED', color: 'text-emerald-400', icon: <Check className="w-4 h-4" /> };
            case 'failed': return { text: 'EXCEPTION: ACCESS TOKEN REJECTED', color: 'text-rose-500', icon: <XCircle className="w-4 h-4" /> };
            default: return null;
        }
    }, [testStatus]);

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
            <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
                <span className="text-neutral-200 font-medium flex items-center gap-2">
                    <Zap className="w-4 h-4 text-amber-400" />
                    [PROV] GCP_FIREBASE_AUTHENTICATION
                </span>
                <span className="text-[10px] text-neutral-600">v3.0.0-PROD</span>
            </div>

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

            <div className="space-y-4">
                <div className="grid grid-cols-[120px_1fr] gap-y-2.5 pb-4 border-b border-white/[0.08]">
                    <span className="text-neutral-500 uppercase">SYS_STATUS</span>
                    <span className={`font-medium flex items-center gap-2 ${getStatusDisplay.color}`}>
                        {getStatusDisplay.icon}
                        {getStatusDisplay.text}
                    </span>

                    <span className="text-neutral-500 uppercase">PROV_SCHEME</span>
                    <span className="text-neutral-200">OAUTH2_NATIVE_TUNNEL</span>

                    <span className="text-neutral-500 uppercase">PROTECTION</span>
                    <span className="text-neutral-200">CRYPTO_KEY_ISOLATED</span>

                    <span className="text-neutral-500 uppercase">PERIMETER</span>
                    <span className="text-neutral-200">LOCAL_SECURE_FRAME</span>
                </div>

                {connectionStatus !== 'connected' ? (
                    <>
                        <div className="text-[10px] text-neutral-600 leading-relaxed bg-neutral-900/50 p-3 border border-white/[0.06] rounded-lg">
                            OAuth callback parameters are negotiated synchronously directly against target GCP resource servers. Secret key plaintexts never leak into system telemetry streams.
                        </div>

                        <motion.button
                            onClick={handleConnect}
                            disabled={!isInteractive}
                            className="w-full text-center border border-white/[0.15] hover:border-white/[0.3] text-white bg-transparent py-2.5 px-4 transition-all duration-300 font-mono text-[11px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                            whileHover={{ scale: isInteractive ? 1.01 : 1 }}
                            whileTap={{ scale: isInteractive ? 0.99 : 1 }}
                        >
                            {connectionStatus === 'connecting' ? (
                                <span className="flex items-center justify-center gap-2">
                                    <Loader className="w-4 h-4 animate-spin" />
                                    [ ENGAGING SECURE HANDSHAKE... ]
                                </span>
                            ) : (
                                <span className="flex items-center justify-center gap-2">
                                    <Lock className="w-4 h-4" />
                                    [ INITIALIZE SECURE TUNNEL ]
                                </span>
                            )}
                        </motion.button>
                    </>
                ) : (
                    <>
                        <div className="grid grid-cols-[120px_1fr] gap-y-2.5 pb-4 border-b border-white/[0.08]">
                            <span className="text-neutral-500 uppercase">USER_IDENTITY</span>
                            <span className="text-neutral-200 truncate" title={googleUserEmail || 'UNKNOWN'}>
                                <span className="flex items-center gap-2">
                                    <User className="w-4 h-4 text-neutral-500" />
                                    {googleUserEmail ? googleUserEmail.toUpperCase() : 'RESOLVING...'}
                                </span>
                            </span>

                            <span className="text-neutral-500 uppercase">VAULT_PROTECTION</span>
                            <span className="text-neutral-200">ACTIVE_TUNNEL</span>

                            <span className="text-neutral-500 uppercase">MUTUAL_AUTH</span>
                            <span className="text-emerald-400">VERIFIED</span>
                        </div>

                        {/* Note: I added mode="wait" to AnimatePresence so framer-motion Exits actually fire cleanly */}
                        <AnimatePresence mode="wait">
                            {getTestResultDisplay && (
                                <motion.div
                                    key="testDisplay"
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
                        </AnimatePresence>

                        <div className="grid grid-cols-2 gap-3 mt-2">
                            <motion.button 
                                onClick={handleTest}
                                disabled={!isInteractive}
                                className="text-center border border-neutral-700 hover:border-neutral-500 hover:text-neutral-200 text-neutral-400 bg-transparent py-2.5 px-3 transition-all duration-300 font-mono text-[10px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                                whileHover={{ scale: isInteractive ? 1.01 : 1 }}
                                whileTap={{ scale: isInteractive ? 0.99 : 1 }}
                            >
                                {testStatus === 'testing' ? (
                                    <span className="flex items-center justify-center gap-2">
                                        <RefreshCw className="w-4 h-4 animate-spin" />
                                        [ TESTING ACCESS ]
                                    </span>
                                ) : (
                                    <span className="flex items-center justify-center gap-2">
                                        <Zap className="w-4 h-4" />
                                        [ TEST ACCESS ]
                                    </span>
                                )}
                            </motion.button>
                            <motion.button 
                                onClick={handleDisconnect} 
                                disabled={!isInteractive}
                                className="text-center border border-rose-900/40 hover:border-rose-700 hover:bg-rose-950/20 text-rose-500 bg-transparent py-2.5 px-3 transition-all duration-300 font-mono text-[10px] tracking-wider uppercase font-medium disabled:opacity-40 disabled:cursor-not-allowed rounded-lg shadow-sm hover:shadow-md"
                                whileHover={{ scale: isInteractive ? 1.01 : 1 }}
                                whileTap={{ scale: isInteractive ? 0.99 : 1 }}
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