import { User, LogOut } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export function Navigation({ user, loadingAuth, onSignIn, onSignOut }: any) {
  if (user) return null;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex justify-between items-center px-6 py-4 pointer-events-none">
        <a href="/" className="text-[14px] font-sans font-bold text-white tracking-widest uppercase pointer-events-auto select-none bg-black/30 backdrop-blur-[60px] saturate-[1.2] px-4 py-2 rounded-full border border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.02)] transform-gpu hover:bg-black/50 active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
          Aura
        </a>
        <div className="pointer-events-auto">
          {user ? (
              <button 
                onClick={onSignOut} 
                className="group flex items-center justify-center w-10 h-10 bg-black/30 backdrop-blur-[60px] saturate-[1.2] rounded-full border border-white/[0.04] hover:bg-black/50 hover:border-white/[0.04] shadow-[0_4px_30px_rgba(0,0,0,0.5),0_0_20px_rgba(255,255,255,0.02)] active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                title="Sign Out"
              >
                {user.photoURL ? (
                    <img src={user.photoURL} alt="User" className="w-[26px] h-[26px] rounded-full opacity-80 group-hover:opacity-100 transition-opacity" />
                ) : (
                    <LogOut className="w-[18px] h-[18px] text-white/50 group-hover:text-white transition-colors" />
                )}
              </button>
          ) : (
              <button 
                 onClick={onSignIn} 
                 className="flex items-center gap-2 px-4 py-2 bg-white text-black rounded-full text-[12px] font-bold tracking-tight uppercase hover:bg-neutral-200 active:scale-[0.98] transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-white/50 group"
              >
                  <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span className="translate-y-[0.5px]">Sign In</span>
              </button>
          )}
        </div>
    </nav>
  );
}
