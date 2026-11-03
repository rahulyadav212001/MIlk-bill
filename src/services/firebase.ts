import ReactNativeAsyncStorage from '@react-native-async-storage/async-storage';
import { getApp, getApps, initializeApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import {
  Auth,
  getAuth,
  initializeAuth,
  onAuthStateChanged,
  signInAnonymously,
} from 'firebase/auth';
import { Firestore, getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBJGRAY93E3PGIA8KTTVMi2f2UCCWLZlwM',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'milk-bill-a31be.firebaseapp.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'milk-bill-a31be',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'milk-bill-a31be.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '792806488061',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:792806488061:web:0ed40b77f5349d9b758b94',
};

// Initialize Firebase App
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Initialize Cloud Firestore
const db: Firestore = getFirestore(app);

// In React Native, getReactNativePersistence is exported by firebase/auth
const getReactNativePersistence = (FirebaseAuth as any).getReactNativePersistence;

// Initialize Firebase Auth with React Native AsyncStorage persistence
let auth: Auth | null = null;
let currentUserId: string = 'default_supplier';

try {
  if (typeof getReactNativePersistence === 'function') {
    auth = initializeAuth(app, {
      persistence: getReactNativePersistence(ReactNativeAsyncStorage),
    });
  } else {
    auth = getAuth(app);
  }

  onAuthStateChanged(auth, (user) => {
    if (user) {
      currentUserId = user.uid;
    }
  });
} catch {
  try {
    auth = getAuth(app);
    onAuthStateChanged(auth, (user) => {
      if (user) {
        currentUserId = user.uid;
      }
    });
  } catch {
    // Graceful fallback for offline / test environments
  }
}

let authInitPromise: Promise<string> | null = null;

export async function ensureAuthenticatedUserId(): Promise<string> {
  if (auth && auth.currentUser) {
    currentUserId = auth.currentUser.uid;
    return auth.currentUser.uid;
  }

  if (authInitPromise) {
    return authInitPromise;
  }

  authInitPromise = (async () => {
    if (auth) {
      try {
        const cred = await signInAnonymously(auth);
        currentUserId = cred.user.uid;
        return cred.user.uid;
      } catch (err: any) {
        // Fallback to default supplier if anonymous auth not enabled yet in console
        console.warn('Background auth initialization note:', err?.code || err?.message);
      }
    }
    return currentUserId;
  })();

  try {
    return await authInitPromise;
  } finally {
    authInitPromise = null;
  }
}

export function getCurrentUserIdSync(): string {
  return auth?.currentUser ? auth.currentUser.uid : currentUserId;
}

/**
 * Remove all keys with `undefined` values recursively so Firestore never throws
 * "Function setDoc() called with invalid data. Unsupported field value: undefined"
 */
export function cleanDocData<T extends Record<string, any>>(obj: T): Partial<T> {
  const result: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      if (value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        result[key] = cleanDocData(value);
      } else {
        result[key] = value;
      }
    }
  }
  return result;
}

export { app, auth, db };

