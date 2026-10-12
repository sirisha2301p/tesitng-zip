import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useGame, useMe } from '../../store/game';
import { colors, fonts } from '../../theme';
import { Avatar, useSecondsLeft } from '../ui';
import { WordImage } from '../WordImage';
import { Leaderboard } from './Leaderboard';

const reasonText = {
  time: "Time's up!",
  all_guessed: 'Everyone got it!',
  drawer_left: 'The drawer left.',
  not_enough_players: 'Not enough players left.',
};

/** Between turns: the answer, who scored, the leaderboard, and who draws next. */
export function TurnResultView() {
  const { room, lastTurnEnd, clockOffset } = useGame();
  const me = useMe();
  const nextIn = useSecondsLeft(lastTurnEnd?.nextTurnAt, clockOffset);
  if (!room) return null;

  if (!lastTurnEnd) {
    return (
      <View style={styles.waiting}>
        <Text style={styles.waitingText}>Next turn is starting…</Text>
      </View>
    );
  }

  const drawer = lastTurnEnd.results.find((r) => r.role === 'drawer');
  const guessers = lastTurnEnd.results.filter((r) => r.role === 'guesser');
  const correct = guessers.filter((r) => r.guessed).length;
  const results = [...lastTurnEnd.results].sort((a, b) => b.points - a.points);
  const indexOf = (id: string) => Math.max(0, room.players.findIndex((p) => p.id === id));
  const nextDrawer = room.players.find((p) => p.id === lastTurnEnd.nextDrawerId);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.answer}>
          {lastTurnEnd.imageUrl && (
            <View style={styles.answerImage}>
              <WordImage imageUrl={lastTurnEnd.imageUrl} label={lastTurnEnd.word} size={64} />
            </View>
          )}
          <Text style={styles.answerLabel}>THE WORD WAS</Text>
          <Text style={styles.answerWord} numberOfLines={1} adjustsFontSizeToFit>
            {lastTurnEnd.word.toUpperCase()}
          </Text>
          <Text style={styles.answerMeta}>
            {reasonText[lastTurnEnd.reason]}
            {drawer ? ` Drawn by ${drawer.name} · ${correct} of ${guessers.length} guessed it` : ''}
          </Text>
        </View>

        <Text style={styles.heading}>Points this turn</Text>
        <View style={{ gap: 8 }}>
          {results.map((r) => (
            <View key={r.playerId} style={styles.resultRow}>
              <Avatar name={r.name} index={indexOf(r.playerId)} size={36} />
              <Text style={styles.resultName} numberOfLines={1}>
                {r.name}
                {r.playerId === me?.id ? ' (you)' : ''}{' '}
                <Text style={styles.resultNote}>
                  {r.role === 'drawer' ? `drawer · ${correct} correct` : r.guessed ? 'guessed it' : "didn't guess"}
                </Text>
              </Text>
              <Text style={[styles.points, r.points === 0 && { color: colors.muted }]}>
                {r.points > 0 ? `+${r.points}` : '0'}
              </Text>
            </View>
          ))}
        </View>

        <Text style={styles.heading}>Leaderboard</Text>
        <Leaderboard entries={lastTurnEnd.leaderboard} meId={me?.id} />
      </ScrollView>

      {nextDrawer && (
        <View style={styles.next}>
          <Text style={styles.nextText}>
            Next: <Text style={{ fontFamily: fonts.display }}>{nextDrawer.id === me?.id ? 'You draw' : `${nextDrawer.name} draws`}</Text>{' '}
            in {nextIn}s
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  content: { gap: 16, paddingBottom: 8 },
  waiting: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  waitingText: { fontFamily: fonts.displaySemi, fontSize: 20, color: colors.muted },
  answer: { backgroundColor: colors.yellow, borderRadius: 24, paddingVertical: 22, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  answerImage: { width: 84, height: 84, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  answerLabel: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.ink },
  answerWord: { fontFamily: fonts.display, fontSize: 40, letterSpacing: 2, color: colors.ink },
  answerMeta: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.ink, textAlign: 'center' },
  heading: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  resultName: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.ink },
  resultNote: { fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted },
  points: { fontFamily: fonts.display, fontSize: 18, color: colors.greenDark },
  next: { height: 56, borderRadius: 18, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center' },
  nextText: { fontFamily: fonts.displaySemi, fontSize: 17, color: colors.ink },
});
