import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Button, StyleSheet, Text, View } from 'react-native';
import { MediaStream, mediaDevices, RTCView } from 'react-native-webrtc';

function releaseStream(stream: MediaStream) {
  stream.getTracks().forEach((track) => track.stop());
  stream.release();
}

export default function App() {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const startingRef = useRef(false);
  const requestId = useRef(0);
  const mounted = useRef(true);

  const stopCamera = useCallback(() => {
    requestId.current += 1;
    if (streamRef.current) {
      releaseStream(streamRef.current);
      streamRef.current = null;
    }
    if (mounted.current) {
      setStream(null);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') stopCamera();
    });

    return () => {
      mounted.current = false;
      subscription.remove();
      stopCamera();
    };
  }, [stopCamera]);

  async function startCamera() {
    if (startingRef.current || streamRef.current) return;

    startingRef.current = true;
    setIsStarting(true);
    setError(null);
    const currentRequest = ++requestId.current;

    try {
      const localStream = await mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: 'environment' },
      });

      if (!mounted.current || currentRequest !== requestId.current) {
        releaseStream(localStream);
        return;
      }

      streamRef.current = localStream;
      setStream(localStream);
    } catch (cause) {
      if (mounted.current && currentRequest === requestId.current) {
        setError(cause instanceof Error ? cause.message : 'Could not start the camera.');
      }
    } finally {
      startingRef.current = false;
      if (mounted.current) setIsStarting(false);
    }
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <Text style={styles.title}>Yunkha WebRTC camera</Text>
      <View style={styles.preview}>
        {stream ? (
          <RTCView style={styles.video} streamURL={stream.toURL()} objectFit="cover" />
        ) : (
          <Text style={styles.message}>Camera stopped</Text>
        )}
      </View>
      {error && <Text style={styles.error} accessibilityRole="alert">{error}</Text>}
      <View style={styles.controls}>
        <Button title="Start Camera" onPress={startCamera} disabled={isStarting || !!stream} />
        <Button title="Stop Camera" onPress={stopCamera} disabled={!isStarting && !stream} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111', paddingTop: 48, paddingBottom: 32 },
  title: { color: '#fff', textAlign: 'center', fontSize: 20, marginBottom: 16 },
  preview: { flex: 1, backgroundColor: '#222', justifyContent: 'center' },
  video: { flex: 1 },
  message: { color: '#fff', textAlign: 'center' },
  error: { color: '#ff8787', textAlign: 'center', padding: 12 },
  controls: { flexDirection: 'row', justifyContent: 'space-evenly', paddingTop: 16 },
});
