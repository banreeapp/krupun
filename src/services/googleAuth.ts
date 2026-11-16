import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  User,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

export const SHEETS_SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
for (const scope of SHEETS_SCOPES) {
  provider.addScope(scope);
}
provider.setCustomParameters({
  prompt: 'consent select_account',
});

let isSigningIn = false;
// Strictly in-memory cache (never stored in localStorage or sessionStorage)
let cachedAccessToken: string | null = null;
let cachedHasSheetsScope = false;

export async function verifySheetsScope(accessToken: string): Promise<boolean> {
  try {
    const res = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return true; // If tokeninfo is unreachable, let actual Sheets API decide
    const data = (await res.json()) as { scope?: string };
    const scopes = (data.scope || '').split(/\s+/).filter(Boolean);
    return scopes.some(
      (s) =>
        s === 'https://www.googleapis.com/auth/spreadsheets' ||
        s === 'https://www.googleapis.com/auth/drive'
    );
  } catch {
    return true;
  }
}

export const initAuth = (
  onAuthSuccess?: (user: User, token: string, hasSheetsScope: boolean) => void,
  onAuthFailure?: (user: User | null) => void
) => {
  return onAuthStateChanged(auth, (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        onAuthSuccess?.(user, cachedAccessToken, cachedHasSheetsScope);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        cachedHasSheetsScope = false;
        onAuthFailure?.(user);
      }
    } else {
      cachedAccessToken = null;
      cachedHasSheetsScope = false;
      onAuthFailure?.(null);
    }
  });
};

export const googleSignIn = async (): Promise<{
  user: User;
  accessToken: string;
  hasSheetsScope: boolean;
}> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่สามารถรับสิทธิ์เข้าถึง Google Sheets ได้ กรุณาลองใหม่อีกครั้ง');
    }
    const token = credential.accessToken;
    const hasSheetsScope = await verifySheetsScope(token);
    cachedAccessToken = token;
    cachedHasSheetsScope = hasSheetsScope;
    return { user: result.user, accessToken: token, hasSheetsScope };
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = (): string | null => {
  return cachedAccessToken;
};

export const getHasSheetsScope = (): boolean => {
  return cachedHasSheetsScope;
};

export const clearCachedToken = () => {
  cachedAccessToken = null;
  cachedHasSheetsScope = false;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
  cachedHasSheetsScope = false;
};
