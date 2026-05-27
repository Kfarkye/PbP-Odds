import { initializeApp } from "firebase/app";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, GithubAuthProvider, onAuthStateChanged } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";
const app = initializeApp(firebaseConfig);
setLogLevel("error");
export const db = firebaseConfig.firestoreDatabaseId ? getFirestore(app, firebaseConfig.firestoreDatabaseId) : getFirestore(app);
export const auth = getAuth(app);
const provider = new GoogleAuthProvider();
provider.addScope("https://www.googleapis.com/auth/gmail.readonly");
provider.addScope("https://www.googleapis.com/auth/calendar.events");
provider.addScope("https://www.googleapis.com/auth/drive");
provider.addScope("https://www.googleapis.com/auth/drive.file");
provider.addScope("https://www.googleapis.com/auth/tasks");
const githubProvider = new GithubAuthProvider();
githubProvider.addScope("repo");
githubProvider.addScope("read:user");
let isSigningIn = false;
let cachedAccessToken = null;
let cachedGithubToken = null;
export const initAuth = (onAuthSuccess, onAuthFailure) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (cachedAccessToken || cachedGithubToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken || cachedGithubToken);
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
export const googleSignIn = async () => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error("Failed to get access token from Firebase Auth");
    }
    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error("Sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};
export const githubSignIn = async () => {
  try {
    isSigningIn = true;
    let result;
    if (auth.currentUser) {
      const isLinked = auth.currentUser.providerData.some((p) => p.providerId === "github.com");
      if (isLinked) {
        result = await signInWithPopup(auth, githubProvider);
      } else {
        try {
          const { linkWithPopup } = await import("firebase/auth");
          result = await linkWithPopup(auth.currentUser, githubProvider);
        } catch (linkError) {
          if (linkError.code === "auth/credential-already-in-use") {
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
      throw new Error("Failed to get GitHub access token from Firebase Auth");
    }
    cachedGithubToken = credential.accessToken;
    return { user: result.user, accessToken: cachedGithubToken };
  } catch (error) {
    console.error("GitHub sign in error:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};
export const getAccessToken = async () => {
  return cachedAccessToken || cachedGithubToken;
};
export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  cachedGithubToken = null;
};
export const getGithubToken = async () => {
  return cachedGithubToken;
};
