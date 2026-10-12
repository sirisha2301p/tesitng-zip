import AsyncStorage from '@react-native-async-storage/async-storage';

/** What the app needs to get back into a room after the connection drops or the app restarts. */
export interface Session {
  code: string;
  playerId: string;
  token: string;
}

const SESSION_KEY = 'drawguess.session';
const NAME_KEY = 'drawguess.name';

async function safely<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

export const storage = {
  loadSession: () =>
    safely(async () => {
      const raw = await AsyncStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as Session) : null;
    }, null),
  saveSession: (session: Session) => safely(() => AsyncStorage.setItem(SESSION_KEY, JSON.stringify(session)), undefined),
  clearSession: () => safely(() => AsyncStorage.removeItem(SESSION_KEY), undefined),
  loadName: () => safely(() => AsyncStorage.getItem(NAME_KEY), null),
  saveName: (name: string) => safely(() => AsyncStorage.setItem(NAME_KEY, name), undefined),
};
