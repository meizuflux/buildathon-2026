import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
let webToken: string | null = null;
// Auth integration seam. No production login or token is invented here.
export const session = {
  getToken: async () => Platform.OS === 'web' ? webToken : SecureStore.getItemAsync('haven.access-token'),
  setToken: async (token: string | null) => {
    if (Platform.OS === 'web') { webToken = token; return; }
    if (token) await SecureStore.setItemAsync('haven.access-token', token);
    else await SecureStore.deleteItemAsync('haven.access-token');
  },
};
