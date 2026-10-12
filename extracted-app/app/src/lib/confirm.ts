import { Alert, Platform } from 'react-native';

/** Ask before leaving a room. The web has no native alert with buttons, so it uses confirm(). */
export function confirmLeave(onLeave: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm('Leave this room?')) onLeave();
    return;
  }
  Alert.alert('Leave this room?', undefined, [
    { text: 'Stay', style: 'cancel' },
    { text: 'Leave', style: 'destructive', onPress: onLeave },
  ]);
}
