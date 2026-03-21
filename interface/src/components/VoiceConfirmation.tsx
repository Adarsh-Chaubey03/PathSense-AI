import React, {useState, useEffect, useCallback, useRef} from 'react';
import {View, Text, StyleSheet, TouchableOpacity, ActivityIndicator} from 'react-native';
import Tts from 'react-native-tts';
import Voice, {SpeechResultsEvent, SpeechErrorEvent} from '@react-native-voice/voice';
import {COLORS, SPACING, FONT_SIZES, VOICE_CONFIG} from '../constants';

// API Configuration - Update with your server IP
const API_BASE_URL = 'http://10.0.2.2:4000'; // Android emulator localhost
// const API_BASE_URL = 'http://localhost:4000'; // iOS simulator
// const API_BASE_URL = 'http://YOUR_IP:4000'; // Physical device

interface VoiceConfirmationProps {
  onResult?: (response: FallEventResponse) => void;
  onError?: (error: string) => void;
  autoStart?: boolean;
}

interface FallEventResponse {
  status: 'CONFIRMED' | 'REJECTED' | 'UNCERTAIN';
  sosTriggered: boolean;
}

type ListeningState = 'idle' | 'speaking' | 'listening' | 'processing' | 'complete' | 'error';

const VoiceConfirmation: React.FC<VoiceConfirmationProps> = ({
  onResult,
  onError,
  autoStart = false,
}) => {
  const [state, setState] = useState<ListeningState>('idle');
  const [transcript, setTranscript] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [response, setResponse] = useState<FallEventResponse | null>(null);
  const transcriptRef = useRef<string>('');

  // Initialize TTS settings
  useEffect(() => {
    Tts.setDefaultRate(VOICE_CONFIG.defaultRate);
    Tts.setDefaultPitch(VOICE_CONFIG.defaultPitch);
    Tts.setDefaultLanguage(VOICE_CONFIG.language);

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // Setup Voice listeners
  useEffect(() => {
    Voice.onSpeechResults = onSpeechResults;
    Voice.onSpeechError = onSpeechError;
    Voice.onSpeechEnd = onSpeechEnd;

    return () => {
      Voice.destroy().then(Voice.removeAllListeners);
    };
  }, []);

  // Auto-start if prop is true
  useEffect(() => {
    if (autoStart) {
      startVoiceFlow();
    }
  }, [autoStart]);

  const onSpeechResults = (event: SpeechResultsEvent) => {
    if (event.value && event.value.length > 0) {
      const result = event.value[0];
      setTranscript(result);
      transcriptRef.current = result;
      console.log('[Voice] Transcript received:', result);
    }
  };

  const onSpeechError = (event: SpeechErrorEvent) => {
    const errorMessage = event.error?.message || 'Speech recognition error';
    console.error('[Voice] Error:', errorMessage);
    setError(errorMessage);
    setState('error');
    onError?.(errorMessage);
  };

  const onSpeechEnd = () => {
    console.log('[Voice] Speech ended');
  };

  // Send transcript to backend
  const sendTranscript = async (text: string): Promise<FallEventResponse | null> => {
    try {
      console.log('[API] Sending transcript to backend:', text);

      const response = await fetch(`${API_BASE_URL}/api/fall-event`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          motionScore: 0.1,
          orientationChange: true,
          transcript: text,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status}`);
      }

      const data: FallEventResponse = await response.json();
      console.log('[API] Response:', data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Network error';
      console.error('[API] Error:', errorMessage);
      setError(errorMessage);
      onError?.(errorMessage);
      return null;
    }
  };

  // Start listening for voice input
  const startListening = async () => {
    try {
      setState('listening');
      setTranscript('');
      setError('');

      await Voice.start(VOICE_CONFIG.language);
      console.log('[Voice] Started listening');

      // Auto-stop after 5 seconds
      setTimeout(async () => {
        await stopListening();
      }, 5000);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to start voice recognition';
      console.error('[Voice] Start error:', errorMessage);
      setError(errorMessage);
      setState('error');
      onError?.(errorMessage);
    }
  };

  // Stop listening and process
  const stopListening = async () => {
    try {
      await Voice.stop();
      console.log('[Voice] Stopped listening');

      setState('processing');

      // Use ref to get current transcript value (avoids stale closure)
      const currentTranscript = transcriptRef.current;
      console.log('[Voice] Processing transcript:', currentTranscript || '(empty)');

      // Send to backend
      const result = await sendTranscript(currentTranscript);

      if (result) {
        setResponse(result);
        setState('complete');
        onResult?.(result);
      } else {
        setState('error');
      }
    } catch (err) {
      console.error('[Voice] Stop error:', err);
    }
  };

  // Main flow: Speak → Listen → Send
  const startVoiceFlow = useCallback(async () => {
    try {
      // Reset state
      setState('speaking');
      setTranscript('');
      transcriptRef.current = '';
      setError('');
      setResponse(null);

      console.log('[TTS] Speaking: "Are you okay?"');

      // Speak the prompt
      await new Promise<void>((resolve, reject) => {
        Tts.speak('Are you okay?', {
          onDone: () => {
            console.log('[TTS] Finished speaking');
            resolve();
          },
          onCancel: () => resolve(),
          onError: (err) => reject(err),
        });
      });

      // Small delay before listening
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Start listening
      await startListening();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Voice flow error';
      console.error('[VoiceFlow] Error:', errorMessage);
      setError(errorMessage);
      setState('error');
      onError?.(errorMessage);
    }
  }, []);

  // Reset to initial state
  const reset = () => {
    setState('idle');
    setTranscript('');
    transcriptRef.current = '';
    setError('');
    setResponse(null);
  };

  // Get status message based on state
  const getStatusMessage = (): string => {
    switch (state) {
      case 'idle':
        return 'Press button to start check';
      case 'speaking':
        return 'Speaking: "Are you okay?"';
      case 'listening':
        return 'Listening for response...';
      case 'processing':
        return 'Processing...';
      case 'complete':
        return response?.sosTriggered ? 'SOS Alert Sent!' : 'Check Complete';
      case 'error':
        return `Error: ${error}`;
      default:
        return '';
    }
  };

  // Get status color based on state
  const getStatusColor = (): string => {
    switch (state) {
      case 'complete':
        return response?.sosTriggered ? COLORS.error : COLORS.success;
      case 'error':
        return COLORS.error;
      case 'listening':
        return COLORS.highlight;
      default:
        return COLORS.textSecondary;
    }
  };

  const isProcessing = state === 'speaking' || state === 'listening' || state === 'processing';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Fall Detection Check</Text>

      {/* Status Display */}
      <View style={styles.statusContainer}>
        {isProcessing && <ActivityIndicator size="large" color={COLORS.highlight} />}
        <Text style={[styles.statusText, {color: getStatusColor()}]}>
          {getStatusMessage()}
        </Text>
      </View>

      {/* Transcript Display */}
      {transcript ? (
        <View style={styles.transcriptContainer}>
          <Text style={styles.transcriptLabel}>You said:</Text>
          <Text style={styles.transcriptText}>"{transcript}"</Text>
        </View>
      ) : null}

      {/* Response Display */}
      {response && (
        <View style={styles.responseContainer}>
          <Text style={styles.responseLabel}>Result:</Text>
          <Text
            style={[
              styles.responseStatus,
              {color: response.status === 'CONFIRMED' ? COLORS.error : COLORS.success},
            ]}>
            {response.status}
          </Text>
          <Text style={styles.responseDetail}>
            SOS Triggered: {response.sosTriggered ? 'Yes' : 'No'}
          </Text>
        </View>
      )}

      {/* Action Buttons */}
      <View style={styles.buttonContainer}>
        {state === 'idle' || state === 'complete' || state === 'error' ? (
          <TouchableOpacity
            style={styles.startButton}
            onPress={startVoiceFlow}
            accessibilityLabel="Start fall detection check"
            accessibilityRole="button">
            <Text style={styles.buttonText}>Start Check</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={[styles.startButton, styles.cancelButton]}
            onPress={reset}
            accessibilityLabel="Cancel check"
            accessibilityRole="button">
            <Text style={styles.buttonText}>Cancel</Text>
          </TouchableOpacity>
        )}

        {(state === 'complete' || state === 'error') && (
          <TouchableOpacity
            style={styles.resetButton}
            onPress={reset}
            accessibilityLabel="Reset"
            accessibilityRole="button">
            <Text style={styles.resetButtonText}>Reset</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    margin: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZES.xl,
    fontWeight: 'bold',
    color: COLORS.text,
    textAlign: 'center',
    marginBottom: SPACING.lg,
  },
  statusContainer: {
    alignItems: 'center',
    minHeight: 60,
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  statusText: {
    fontSize: FONT_SIZES.md,
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  transcriptContainer: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
  },
  transcriptLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  transcriptText: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.text,
    fontStyle: 'italic',
  },
  responseContainer: {
    backgroundColor: COLORS.background,
    padding: SPACING.md,
    borderRadius: 8,
    marginBottom: SPACING.md,
    alignItems: 'center',
  },
  responseLabel: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  responseStatus: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: 'bold',
    marginBottom: SPACING.xs,
  },
  responseDetail: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
  buttonContainer: {
    gap: SPACING.sm,
  },
  startButton: {
    backgroundColor: COLORS.highlight,
    paddingVertical: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    backgroundColor: COLORS.error,
  },
  buttonText: {
    fontSize: FONT_SIZES.lg,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  resetButton: {
    backgroundColor: COLORS.border,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
  },
});

export default VoiceConfirmation;
