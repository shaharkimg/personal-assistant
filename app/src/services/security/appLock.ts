import AsyncStorage from "@react-native-async-storage/async-storage";
import * as LocalAuthentication from "expo-local-authentication";

const KEY = "app_lock_enabled";

export async function isAppLockEnabled(): Promise<boolean> {
  return (await AsyncStorage.getItem(KEY)) === "1";
}

export async function canUseBiometrics(): Promise<boolean> {
  return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
}

export async function setAppLockEnabled(enabled: boolean): Promise<boolean> {
  if (enabled) {
    // Confirm the user can actually unlock before turning the lock on.
    const ok = await authenticate();
    if (!ok) return false;
  }
  await AsyncStorage.setItem(KEY, enabled ? "1" : "0");
  return true;
}

export async function authenticate(): Promise<boolean> {
  const res = await LocalAuthentication.authenticateAsync({
    promptMessage: "פתיחת העוזר האישי",
    cancelLabel: "ביטול",
    disableDeviceFallback: false,
  });
  return res.success;
}
