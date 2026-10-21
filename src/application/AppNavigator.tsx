import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { Role } from '../../devConfig';
import { colors } from '../theme/tokens';
import CameraScreen from '../screens/CameraScreen';
import HomeScreen from '../screens/HomeScreen';
import MonitorScreen from '../screens/MonitorScreen';

export default function AppNavigator() {
  const [role, setRole] = useState<Role | null>(null);
  const [showDesignSystem, setShowDesignSystem] = useState(false);
  // The showcase module is loaded only in development, as in the original entry point.
  const ComponentShowcase = __DEV__ && showDesignSystem
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ? (require('../components/ComponentShowcase').default as typeof import('../components/ComponentShowcase').default)
    : null;
  const isHome = !role && !ComponentShowcase;

  return (
    <SafeAreaView edges={isHome || role ? ['top', 'bottom'] : ['bottom']} style={[styles.container, (isHome || role) && styles.fullBleedContainer]}>
      <StatusBar style="light" />
      {ComponentShowcase ? (
        <ComponentShowcase onClose={() => setShowDesignSystem(false)} />
      ) : role === 'sender' ? (
        <CameraScreen onLeave={() => setRole(null)} />
      ) : role === 'receiver' ? (
        <MonitorScreen onLeave={() => setRole(null)} />
      ) : (
        <HomeScreen
          onCamera={() => setRole('sender')}
          onMonitor={() => setRole('receiver')}
          onShowcase={() => setShowDesignSystem(true)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background, paddingTop: 48, paddingBottom: 32 },
  fullBleedContainer: { paddingTop: 0, paddingBottom: 0 },
});
