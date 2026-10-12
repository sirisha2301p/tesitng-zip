import { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useGame, useMe } from '../../store/game';
import { colors, fonts } from '../../theme';
import { DrawingCanvas } from '../DrawingCanvas';
import { Icon } from '../Icon';
import { ErrorText } from '../ui';
import { GameHeader } from './GameHeader';

export function GuesserView() {
  const { room, strokes, feed, myGuessedWord, submitGuess } = useGame();
  const me = useMe();
  const { height } = useWindowDimensions();
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const feedRef = useRef<ScrollView>(null);
  const inputRef = useRef<TextInput>(null);
  if (!room?.turn) return null;

  const drawer = room.players.find((p) => p.isDrawer);
  const iGuessed = !!myGuessedWord || !!me?.hasGuessed;

  const send = async () => {
    const guess = text.trim();
    if (!guess || sending || iGuessed) return;
    setError(null);
    setSending(true);
    setText('');
    try {
      await submitGuess(guess);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  // Blanks per word: "ice cream" -> "_ _ _   _ _ _ _ _". Once guessed, the real letters.
  const blanks = myGuessedWord
    ? myGuessedWord.toUpperCase()
    : room.turn.wordLengths.map((n) => Array.from({ length: n }, () => '_').join(' ')).join('    ');
  const letterCount = room.turn.wordLengths.reduce((a, b) => a + b, 0);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 20 : 0}
    >
      <GameHeader title={`${drawer?.name ?? 'Someone'} is drawing`} />

      <View style={styles.blanksCard}>
        <Text style={styles.blanks} accessibilityLabel={myGuessedWord ? `The word is ${myGuessedWord}` : `${letterCount} letters`}>
          {blanks}
        </Text>
        <Text style={styles.blanksMeta}>
          {letterCount} letters · <Text style={{ textTransform: 'capitalize' }}>{room.turn.category}</Text>
        </Text>
      </View>

      <DrawingCanvas strokes={strokes} maxSize={height * 0.36} />

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={{ flexGrow: 0 }}>
        {room.players.map((p) => (
          <View key={p.id} style={[styles.chip, p.hasGuessed && styles.chipGuessed]}>
            {p.hasGuessed && <Icon name="check" size={14} color={colors.greenDark} strokeWidth={3} />}
            <Text style={[styles.chipText, p.hasGuessed && { color: colors.greenDark }]}>
              {p.name}
              {p.id === me?.id ? ' (you)' : ''}
            </Text>
            <Text style={styles.chipScore}>{p.isDrawer ? 'drawing' : p.score}</Text>
          </View>
        ))}
      </ScrollView>

      <ScrollView
        ref={feedRef}
        style={styles.feed}
        contentContainerStyle={styles.feedContent}
        onContentSizeChange={() => feedRef.current?.scrollToEnd({ animated: true })}
      >
        {feed.length === 0 && <Text style={styles.feedEmpty}>Guesses will show up here.</Text>}
        {feed.map((item) => (
          <View key={item.id} style={styles.feedRow}>
            {item.kind === 'correct' && <Icon name="check" size={16} color={colors.greenDark} strokeWidth={3} />}
            <Text
              style={[
                styles.feedText,
                item.kind === 'correct' && styles.feedCorrect,
                item.kind === 'close' && styles.feedClose,
                item.kind === 'info' && styles.feedInfo,
              ]}
            >
              {item.kind === 'wrong' ? <Text style={styles.feedName}>{item.name}: </Text> : null}
              {item.text}
            </Text>
          </View>
        ))}
      </ScrollView>

      <ErrorText message={error} />
      {iGuessed ? (
        <View style={styles.doneBox}>
          <Icon name="check" size={20} color={colors.greenDark} strokeWidth={3} />
          <Text style={styles.doneText}>You got it! Waiting for the others…</Text>
        </View>
      ) : (
        <View style={styles.inputRow}>
          <TextInput
            ref={inputRef}
            accessibilityLabel="Your guess"
            value={text}
            onChangeText={setText}
            onSubmitEditing={send}
            placeholder="Type your guess…"
            placeholderTextColor={colors.muted}
            maxLength={40}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="send"
            blurOnSubmit={false}
            style={styles.input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send guess"
            onPress={send}
            disabled={!text.trim() || sending}
            style={({ pressed }) => [styles.sendButton, (!text.trim() || sending) && { opacity: 0.5 }, pressed && { opacity: 0.75 }]}
          >
            <Icon name="send" size={22} color="#FFFFFF" strokeWidth={2.2} />
          </Pressable>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, gap: 10 },
  blanksCard: { backgroundColor: colors.card, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, alignItems: 'center', gap: 4 },
  blanks: { fontFamily: fonts.display, fontSize: 24, letterSpacing: 2, color: colors.ink, textAlign: 'center' },
  blanksMeta: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  chips: { gap: 6 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  chipGuessed: { backgroundColor: colors.greenTint },
  chipText: { fontFamily: fonts.bodyHeavy, fontSize: 13, color: colors.ink },
  chipScore: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.muted },
  feed: { flex: 1, minHeight: 60, backgroundColor: colors.card, borderRadius: 16 },
  feedContent: { paddingHorizontal: 14, paddingVertical: 10, gap: 6, flexGrow: 1, justifyContent: 'flex-end' },
  feedEmpty: { fontFamily: fonts.body, fontSize: 14, color: colors.muted },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  feedText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.ink },
  feedName: { fontFamily: fonts.bodyHeavy },
  feedCorrect: { fontFamily: fonts.bodyHeavy, color: colors.greenDark },
  feedClose: { fontFamily: fonts.bodyHeavy, color: colors.closeText },
  feedInfo: { fontFamily: fonts.bodyBold, color: colors.muted },
  inputRow: { flexDirection: 'row', gap: 8 },
  input: {
    flex: 1,
    minWidth: 0,
    height: 54,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: colors.ink,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.bodySemi,
    fontSize: 17,
    color: colors.ink,
  },
  sendButton: {
    width: 54,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.green,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 54,
    borderRadius: 16,
    backgroundColor: colors.greenTint,
  },
  doneText: { fontFamily: fonts.bodyHeavy, fontSize: 15, color: colors.greenDark },
});
