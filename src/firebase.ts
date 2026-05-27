import { initializeApp } from 'firebase/app';
import { getFirestore, setLogLevel } from 'firebase/firestore';
import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
setLogLevel('error');
export const db = (firebaseConfig as any).firestoreDatabaseId 
  ? getFirestore(app, (firebaseConfig as any).firestoreDatabaseId)
  : getFirestore(app);

export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Add all Google Workspace scopes requested by Aura
provider.addScope('https://www.googleapis.com/auth/gmail.readonly');
provider.addScope('https://www.googleapis.com/auth/calendar.events');
provider.addScope('https://www.googleapis.com/auth/drive');
provider.addScope('https://www.googleapis.com/auth/drive.file');
provider.addScope('https://www.googleapis.com/auth/tasks');

const githubProvider = new GithubAuthProvider();
githubProvider.addScope('repo');
githubProvider.addScope('read:user');

// In-Memory Google Access Token store
let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedGithubToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken || cachedGithubToken) {
        if (onAuthSuccess) onAuthSuccess(user, (cachedAccessToken || cachedGithubToken)!);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedGithubToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedGithubToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const githubSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    let result;
    
    if (auth.currentUser) {
      const isLinked = auth.currentUser.providerData.some(p => p.providerId === 'github.com');
      if (isLinked) {
        result = await signInWithPopup(auth, githubProvider);
      } else {
        try {
          // Import linkWithPopup dynamically or ensure it's available
          const { linkWithPopup } = await import('firebase/auth');
          result = await linkWithPopup(auth.currentUser, githubProvider);
        } catch (linkError: any) {
          if (linkError.code === 'auth/credential-already-in-use') {
            result = await signInWithPopup(auth, githubProvider);
          } else {
            throw linkError;
          }
        }
      }
    } else {
      result = await signInWithPopup(auth, githubProvider);
    }

    const credential = GithubAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get GitHub access token from Firebase Auth');
    }

    cachedGithubToken = credential.accessToken;
    return { user: result.user, accessToken: cachedGithubToken };
  } catch (error: any) {
    console.error('GitHub sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken || cachedGithubToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  cachedGithubToken = null;
};


export const getGithubToken = async (): Promise<string | null> => { return cachedGithubToken; };
