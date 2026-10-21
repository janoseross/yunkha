import AsyncStorage from '@react-native-async-storage/async-storage';

import { ROOM_CODE_PATTERN } from '../services/signaling/types';

const LAST_MONITOR_ROOM_KEY = '@yunkha/last-monitor-room';

export async function readRecentRoom() {
  const code = await AsyncStorage.getItem(LAST_MONITOR_ROOM_KEY);
  return code && ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function saveRecentRoom(code: string) {
  return AsyncStorage.setItem(LAST_MONITOR_ROOM_KEY, code);
}
