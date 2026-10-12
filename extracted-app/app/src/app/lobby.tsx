import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { Icon } from '../components/Icon';
import { confirmLeave } from '../lib/confirm';
import { Avatar, Button, ConnectionBanner, ErrorText, IconButton, Screen } from '../components/ui';
import { useGame, useMe } from '../store/game';
import { colors, fonts } from '../theme';

export default function LobbyScreen() {
  const { room, connected, startGame, leaveRoom } = useGame();
  const me = useMe();
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      confirmLeave(() => void leaveRoom());
      return true;
    });
    return () => sub.remove();
  }, [leaveRoom]);

  if (!room) return null;
  const { settings, players } = room;
  const joined = players.length;
  const allHere = joined === settings.teamSize && players.every((p) => p.connected);
  const isHost = me?.isHost ?? false;
  const emptySeats = Math.max(0, settings.teamSize - joined);
  const inviteLink = Linking.createURL(`/join/${room.code}`);

  const share = async () => {
    try {
      await Share.share({
        message: `Join my Draw & Guess game! Room code: ${room.code}\n${inviteLink}`,
      });
    } catch {
      // The user closed the share sheet.
    }
  };

  const copy = async () => {
    await Clipboard.setStringAsync(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      await startGame();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <IconButton icon="back" label="Leave room" onPress={() => confirmLeave(() => void leaveRoom())} />
        <Text style={styles.title} accessibilityRole="header">
          Waiting room
        </Text>
      </View>
      <ConnectionBanner connected={connected} />

      <View style={styles.codeCard}>
        <Text style={styles.codeLabel}>ROOM CODE</Text>
        <Text style={styles.code} selectable accessibilityLabel={`Room code ${room.code.split('').join(' ')}`}>
          {room.code}
        </Text>
        <View style={styles.codeActions}>
          <Button label="Share invite link" icon="share" variant="accent" size="medium" onPress={share} style={{ flex: 1 }} />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Code copied' : 'Copy code'}
            onPress={copy}
            style={styles.copyButton}
          >
            <Icon name={copied ? 'check' : 'copy'} size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View style={styles.summary}>
        <Text style={styles.summaryChip}>{settings.teamSize} players</Text>
        <Text style={styles.summaryChip}>{settings.turnTime}s per turn</Text>
        <Text style={styles.summaryChip}>
          {settings.category === 'mixed' ? 'Mixed' : settings.category} · {settings.rounds}{' '}
          {settings.rounds === 1 ? 'round' : 'rounds'}
        </Text>
      </View>

      <View style={styles.playersHead}>
        <Text style={styles.playersTitle}>Players</Text>
        <Text style={styles.joinedCount}>
          {joined} / {settings.teamSize} joined
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {players.map((p, i) => (
          <View key={p.id} style={styles.playerRow}>
            <Avatar name={p.name} index={i} />
            <Text style={styles.playerName} numberOfLines={1}>
              {p.name}
              {p.id === me?.id ? ' (you)' : ''}
            </Text>
            {p.isHost ? (
              <Text style={styles.hostTag}>HOST</Text>
            ) : (
              <Text style={[styles.status, !p.connected && { color: colors.muted }]}>
                {p.connected ? 'Ready' : 'Reconnecting…'}
              </Text>
            )}
          </View>
        ))}
        {Array.from({ length: emptySeats }, (_, i) => (
          <View key={`empty-${i}`} style={styles.emptyRow}>
            <View style={styles.emptyAvatar}>
              <Icon name="plus" size={18} color={colors.muted} strokeWidth={2.2} />
            </View>
            <Text style={styles.emptyText}>
              {emptySeats === 1 ? 'Waiting for 1 more friend…' : `Waiting for ${emptySeats} more friends…`}
            </Text>
          </View>
        )).slice(0, 1)}
      </ScrollView>

      <ErrorText message={error} />
      {isHost ? (
        <View style={{ gap: 8 }}>
          <Button label="Start game" onPress={start} disabled={!allHere || !connected} loading={starting} />
          {!allHere && (
            <Text style={styles.footnote}>Starts when all {settings.teamSize} players have joined</Text>
          )}
        </View>
      ) : (
        <Text style={styles.footnote}>
          {allHere ? 'Everyone is here. Waiting for the host to start…' : 'Waiting for everyone to join…'}
        </Text>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontFamily: fonts.displaySemi, fontSize: 26, color: colors.ink },
  codeCard: { backgroundColor: colors.ink, borderRadius: 22, padding: 22, alignItems: 'center', gap: 6 },
  codeLabel: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.onDarkMuted },
  code: { fontFamily: fonts.display, fontSize: 44, letterSpacing: 6, color: '#FFFFFF' },
  codeActions: { flexDirection: 'row', gap: 10, marginTop: 10, alignSelf: 'stretch' },
  copyButton: {
    width: 52,
    height: 52,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4A5A4E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  summaryChip: {
    fontFamily: fonts.bodyBold,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  playersHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  playersTitle: { fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  joinedCount: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.green },
  list: { gap: 10 },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  playerName: { flex: 1, fontFamily: fonts.bodyHeavy, fontSize: 16, color: colors.ink },
  hostTag: {
    fontFamily: fonts.bodyHeavy,
    fontSize: 12,
    color: colors.greenDark,
    backgroundColor: colors.greenTint,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    overflow: 'hidden',
  },
  status: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.green },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  emptyAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.dashed,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: { flex: 1, fontFamily: fonts.bodyBold, fontSize: 15, color: colors.muted },
  footnote: { fontFamily: fonts.body, fontSize: 13, color: colors.muted, textAlign: 'center' },
});
