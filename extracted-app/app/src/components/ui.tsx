import { useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { avatarColor, colors, fonts } from '../theme';
import { Icon, type IconName } from './Icon';

export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <View style={[styles.screen, style]}>{children}</View>
    </SafeAreaView>
  );
}

type ButtonVariant = 'primary' | 'outline' | 'accent' | 'ghost';

export function Button({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled,
  loading,
  style,
  size = 'large',
}: {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'large' | 'medium';
}) {
  const inactive = disabled || loading;
  const palette = inactive && variant === 'primary' ? buttonColors.disabled : buttonColors[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        styles.button,
        size === 'medium' && styles.buttonMedium,
        { backgroundColor: palette.bg, borderColor: palette.border },
        pressed && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.text} />
      ) : (
        <>
          {icon && <Icon name={icon} size={20} color={palette.text} strokeWidth={2.2} />}
          <Text style={[styles.buttonText, size === 'medium' && styles.buttonTextMedium, { color: palette.text }]}>
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const buttonColors: Record<ButtonVariant | 'disabled', { bg: string; border: string; text: string }> = {
  primary: { bg: colors.green, border: colors.green, text: '#FFFFFF' },
  outline: { bg: colors.card, border: colors.ink, text: colors.ink },
  accent: { bg: colors.yellow, border: colors.yellow, text: colors.ink },
  ghost: { bg: 'transparent', border: 'transparent', text: colors.green },
  disabled: { bg: colors.disabled, border: colors.disabled, text: colors.disabledText },
};

export function IconButton({
  icon,
  label,
  onPress,
  style,
  color = colors.ink,
  disabled,
}: {
  icon: IconName;
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  color?: string;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && styles.pressed, disabled && { opacity: 0.4 }, style]}
    >
      <Icon name={icon} size={22} color={color} strokeWidth={2.2} />
    </Pressable>
  );
}

/** A selectable option (team size, timer, category). */
export function Chip({
  label,
  selected,
  onPress,
  shape = 'square',
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  shape?: 'square' | 'pill';
  style?: StyleProp<ViewStyle>;
}) {
  const pill = shape === 'pill';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        pill ? styles.pill : styles.chip,
        selected && (pill ? styles.pillSelected : styles.chipSelected),
        pressed && styles.pressed,
        style,
      ]}
    >
      <Text
        style={[
          pill ? styles.pillText : styles.chipText,
          selected && !pill && { color: '#FFFFFF' },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function Avatar({ name, index, size = 44 }: { name: string; index: number; size?: number }) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: avatarColor(index),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.display, fontSize: size * 0.4, color: colors.ink }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </Text>
    </View>
  );
}

/** Seconds left, counted on the server's clock. */
export function useSecondsLeft(endsAt: number | null | undefined, clockOffset: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - (now + clockOffset)) / 1000)) : 0;
}

export function TimerBadge({ seconds, total }: { seconds: number; total: number }) {
  const urgent = seconds <= Math.min(5, Math.ceil(total / 3));
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`${seconds} seconds left`}
      style={[styles.timer, { borderColor: urgent ? colors.danger : colors.yellow }]}
    >
      <Text style={[styles.timerText, urgent && { color: colors.danger }]}>{seconds}</Text>
    </View>
  );
}

export function Label({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}

export function ErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={styles.error}>
      {message}
    </Text>
  );
}

/** How long before we explain that a free-plan server may be waking up. */
const SLOW_CONNECT_MS = 5000;

export function ConnectionBanner({ connected }: { connected: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (connected) return;
    const id = setTimeout(() => setSlow(true), SLOW_CONNECT_MS);
    return () => {
      clearTimeout(id);
      setSlow(false);
    };
  }, [connected]);

  if (connected) return null;
  return (
    <View style={styles.banner} accessibilityLiveRegion="polite">
      <ActivityIndicator size="small" color={colors.ink} />
      <Text style={styles.bannerText}>
        {slow
          ? 'Waking up the game server… this can take up to a minute.'
          : 'Connecting to the game server…'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.ground },
  screen: { flex: 1, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16, gap: 18 },
  button: {
    minHeight: 60,
    borderRadius: 18,
    borderWidth: 2,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonMedium: { minHeight: 52, borderRadius: 16 },
  buttonText: { fontFamily: fonts.display, fontSize: 20 },
  buttonTextMedium: { fontSize: 17 },
  pressed: { opacity: 0.75 },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    flex: 1,
    height: 48,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSelected: { backgroundColor: colors.green, borderColor: colors.green },
  chipText: { fontFamily: fonts.display, fontSize: 18, color: colors.ink },
  pill: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    justifyContent: 'center',
  },
  pillSelected: { backgroundColor: colors.yellow, borderColor: colors.ink },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.ink },
  timer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 5,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timerText: { fontFamily: fonts.display, fontSize: 22, color: colors.ink },
  label: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  error: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.danger },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.yellow,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  bannerText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink },
});
