import { StyleSheet, Text, View } from 'react-native';
import { useGame } from '../../store/game';
import { colors, fonts } from '../../theme';
import { TimerBadge, useSecondsLeft } from '../ui';

export function GameHeader({ title }: { title: string }) {
  const room = useGame((s) => s.room);
  const clockOffset = useGame((s) => s.clockOffset);
  const seconds = useSecondsLeft(room?.turn?.endsAt, clockOffset);
  if (!room) return null;
  return (
    <View style={styles.header}>
      <View style={{ flex: 1 }}>
        <Text style={styles.round}>
          ROUND {room.round} OF {room.settings.rounds}
        </Text>
        <Text style={styles.title} accessibilityRole="header" numberOfLines={1}>
          {title}
        </Text>
      </View>
      {room.turn && <TimerBadge seconds={seconds} total={room.settings.turnTime} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  round: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.muted },
  title: { fontFamily: fonts.displaySemi, fontSize: 20, color: colors.ink },
});
