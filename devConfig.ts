import { Platform } from 'react-native';

export type Role = 'sender' | 'receiver';

// Only this development mapping ties a signaling role to a device platform.
export const role: Role = Platform.OS === 'android' ? 'sender' : 'receiver';
export const signalingUrl = process.env.EXPO_PUBLIC_SIGNALING_URL;
