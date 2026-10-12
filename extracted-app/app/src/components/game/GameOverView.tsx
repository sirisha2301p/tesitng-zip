import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import type { LeaderboardEntry } from '@protocol';
import { useGame, useMe } from '../../store/game';
import { colors, fonts } from '../../theme';
import { Button, ErrorText } from '../ui';
import { Leaderboard } from './Leaderboard';

export function GameOverView() {
  const { room, finalLeaderboard, lastTurnEnd, restartGame, leaveRoom } = useGame();
  const me = useMe();
  const [error, setError] = useState<string | null>(null);
  const [restarting, setRestarting] = useState(false);
  if (!room) return null;

  // If we reconnected after the game ended, rebuild the board from the room's scores.
  const entries: LeaderboardEntry[] =
    finalLeaderboard ??
    [...room.players]
      .sort((a, b) => b.score - a.score)
      .map((p, i, all) => ({
        playerId: p.id,
        name: p.name,
        score: p.score,
        rank: all.findIndex((q) => q.score === p.score) + 1,
      }));
  const winners = entries.filter((e) => e.rank === 1);
  const iWon = winners.some((w) => w.playerId === me?.id);

  const playAgain = async () => {
    setError(null);
    setRestarting(true);
    try {
      await restartGame();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRestarting(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.heroLabel}>GAME OVER</Text>
          <Text style={styles.heroTitle} numberOfLines={2} adjustsFontSizeToFit>
            {iWon ? (winners.length > 1 ? "It's a tie, you won!" : 'You won!') : `${winners.map((w) => w.name).join(' & ')} won!`}
          </Text>
          {lastTurnEnd && <Text style={styles.heroMeta}>The last word was {lastTurnEnd.word}</Text>}
        </View>
        <Text style={styles.heading}>Final scores</Text>
        <Leaderboard entries={entries} meId={me?.id} />
      </ScrollView>

      <ErrorText message={error} />
      {me?.isHost ? (
        <Button label="Play again" onPress={playAgain} loading={restarting} />
      ) : (
        <Text style={styles.footnote}>Waiting for the host to start another game…</Text>
      )}
      <Button label="Leave room" variant="outline" size="medium" onPress={() => void leaveRoom()} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 12 },
  content: { gap: 16, paddingBottom: 8 },
  hero: { backgroundColor: colors.green, borderRadius: 24, paddingVertical: 26, paddingHorizontal: 16, alignItems: 'center', gap: 8 },
  heroLabel: { fontFamily: fonts.bodyHeavy, fontSize: 14, color: colors.greenTint },
  heroTitle: { fontFamily: fonts.display, fontSize: 36, color: '#FFFFFF', textAlign: 'center' },
  heroMeta: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.greenTint },
  heading: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  footnote: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
