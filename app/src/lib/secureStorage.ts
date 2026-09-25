import * as SecureStore from "expo-secure-store";

// Auth tokens are stored in the OS keychain/keystore (never AsyncStorage). SecureStore values are
// limited to ~2KB, so larger values (the Supabase session JSON) are split into chunks.
const CHUNK = 1800;
const OPTS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

function safeKey(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTS);
    if (count === null) return SecureStore.getItemAsync(k, OPTS);
    const parts: string[] = [];
    for (let i = 0; i < Number(count); i++) {
      const part = await SecureStore.getItemAsync(`${k}.${i}`, OPTS);
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join("");
  },
  async setItem(key: string, value: string): Promise<void> {
    const k = safeKey(key);
    await this.removeItem(key);
    const n = Math.ceil(value.length / CHUNK);
    for (let i = 0; i < n; i++) await SecureStore.setItemAsync(`${k}.${i}`, value.slice(i * CHUNK, (i + 1) * CHUNK), OPTS);
    await SecureStore.setItemAsync(`${k}.n`, String(n), OPTS);
  },
  async removeItem(key: string): Promise<void> {
    const k = safeKey(key);
    const count = await SecureStore.getItemAsync(`${k}.n`, OPTS);
    if (count !== null) {
      for (let i = 0; i < Number(count); i++) await SecureStore.deleteItemAsync(`${k}.${i}`, OPTS);
      await SecureStore.deleteItemAsync(`${k}.n`, OPTS);
    }
    await SecureStore.deleteItemAsync(k, OPTS);
  },
};
