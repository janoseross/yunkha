import { CameraView, useCameraPermissions } from 'expo-camera';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Button, StyleSheet, Text, View } from 'react-native';

export default function App() {
  const [permission, requestPermission, getPermission] = useCameraPermissions({ get: false });
  const [isLoading, setIsLoading] = useState(true);
  const [isActive, setIsActive] = useState(AppState.currentState === 'active');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void getPermission()
      .catch(() => setError('Unable to check camera permission. Restart Yunkha to try again.'))
      .finally(() => setIsLoading(false));

    const subscription = AppState.addEventListener('change', (state) => {
      setIsActive(state === 'active');
      if (state === 'active') {
        void getPermission().catch(() => setError('Unable to check camera permission.'));
      }
    });

    return () => subscription.remove();
  }, [getPermission]);

  async function allowCamera() {
    setIsLoading(true);
    setError(null);
    try {
      const response = await requestPermission();
      if (!response.granted && !response.canAskAgain) {
        setError('Camera access is blocked by your phone. Enable camera permission for Expo Go in Settings.');
      }
    } catch {
      setError('Unable to request camera permission. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading || error || !permission?.granted) {
    return (
      <View style={styles.messageContainer}>
        <StatusBar style="light" />
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.message}>
              {error ?? 'Allow camera access to see the live preview.'}
            </Text>
            {!permission?.granted && (
              <Button title="Allow camera" onPress={allowCamera} />
            )}
          </>
        )}
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar hidden />
      {isActive && (
        <CameraView
          style={styles.camera}
          facing="back"
          onMountError={() => setError('Unable to start the camera. Restart Yunkha to try again.')}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#111',
  },
  camera: {
    flex: 1,
  },
  messageContainer: {
    flex: 1,
    backgroundColor: '#111',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  message: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
});
