import { StyleSheet, Text, View } from 'react-native';
import type { LeaderboardEntry } from '@protocol';
import { colors, fonts } from '../../theme';

const medal = ['#F2B33D', '#C9D4C4', '#D9A37A'];

export function Leaderboard({ entries, meId }: { entries: LeaderboardEntry[]; meId?: string }) {
  return (
    <View style={styles.board}>
      {entries.map((e, i) => (
        <View key={e.playerId} style={[styles.row, i < entries.length - 1 && styles.divider]}>
          <View
            style={[
              styles.rank,
              e.rank <= 3 ? { backgroundColor: medal[e.rank - 1] } : { borderWidth: 2, borderColor: '#5A6A5E' },
            ]}
          >
            <Text style={[styles.rankText, e.rank <= 3 && { color: colors.ink }]}>{e.rank}</Text>
          </View>
          <Text style={styles.name} numberOfLines={1}>
            {e.name}
            {e.playerId === meId ? ' (you)' : ''}
          </Text>
          <Text style={styles.score}>{e.score}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  board: { backgroundColor: colors.ink, borderRadius: 18, paddingHorizontal: 16, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  divider: { borderBottomWidth: 1, borderBottomColor: colors.darkDivider },
  rank: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  rankText: { fontFamily: fonts.display, fontSize: 15, color: '#FFFFFF' },
  name: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 16, color: '#FFFFFF' },
  score: { fontFamily: fonts.display, fontSize: 18, color: '#FFFFFF' },
});
