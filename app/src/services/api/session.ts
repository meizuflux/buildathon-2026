import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { config } from '../../constants/config';
const suffix = String(config.baseUrl).split('').reduce<number>((hash, ch) => ((hash * 31) + ch.charCodeAt(0)) >>> 0, 0).toString(16);
const key = 'haven.access-token.' + suffix;
let memory: string | null = null;
export const session = {
  getToken: async () => {
    if (Platform.OS !== 'web') return SecureStore.getItemAsync(key);
    if (typeof sessionStorage !== 'undefined') return sessionStorage.getItem(key);
    return memory;
  },
  setToken: async (token: string | null) => {
    if (Platform.OS === 'web') { memory = token; if (typeof sessionStorage !== 'undefined') { if (token) sessionStorage.setItem(key, token); else sessionStorage.removeItem(key); } return; }
    if (token) await SecureStore.setItemAsync(key, token); else await SecureStore.deleteItemAsync(key);
  },
};
