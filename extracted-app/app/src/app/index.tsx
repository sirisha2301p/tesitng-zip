import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Icon } from '../components/Icon';
import { Button, ConnectionBanner, ErrorText, Label, Screen } from '../components/ui';
import { useGame } from '../store/game';
import { colors, fonts } from '../theme';

export default function HomeScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const { name, setName, joinRoom, connected } = useGame();
  const [code, setCode] = useState(params.code?.toUpperCase() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  // An invite link opened while the app is already on this screen.
  const [linkCode, setLinkCode] = useState(params.code);
  if (params.code !== linkCode) {
    setLinkCode(params.code);
    if (params.code) setCode(params.code.toUpperCase());
  }

  const needName = () => {
    if (name.trim()) return false;
    setError('Enter your name first.');
    return true;
  };

  const create = () => {
    if (needName()) return;
    setError(null);
    router.push('/create');
  };

  const join = async () => {
    if (needName()) return;
    if (!/^[A-Za-z0-9]{6}$/.test(code.trim())) {
      setError('Room codes have 6 letters or numbers.');
      return;
    }
    setError(null);
    setJoining(true);
    try {
      await joinRoom(code);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setJoining(false);
    }
  };

  return (
    <Screen style={{ paddingHorizontal: 0, paddingTop: 0, paddingBottom: 0 }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <ConnectionBanner connected={connected} />

          <View style={styles.hero}>
            <View style={styles.logo}>
              <Icon name="pencil" size={64} color={colors.ink} strokeWidth={1.8} />
            </View>
            <Text style={styles.title} accessibilityRole="header">
              Draw &amp; Guess
            </Text>
            <Text style={styles.tagline}>Draw it. Guess it. Beat your friends.</Text>
          </View>

          <View style={styles.field}>
            <Label style={styles.fieldLabel}>Your name</Label>
            <TextInput
              accessibilityLabel="Your name"
              value={name}
              onChangeText={setName}
              placeholder="e.g. Asha"
              placeholderTextColor={colors.muted}
              maxLength={20}
              autoCapitalize="words"
              style={styles.input}
            />
          </View>

          <Button label="Create a room" icon="plus" onPress={create} />

          <View style={styles.divider}>
            <View style={styles.rule} />
            <Text style={styles.dividerText}>or join friends</Text>
            <View style={styles.rule} />
          </View>

          <View style={styles.field}>
            <Label style={styles.fieldLabel}>Room code</Label>
            <View style={styles.joinRow}>
              <TextInput
                accessibilityLabel="Room code"
                value={code}
                onChangeText={(t) => setCode(t.toUpperCase())}
                placeholder="e.g. PND482"
                placeholderTextColor={colors.muted}
                maxLength={6}
                autoCapitalize="characters"
                autoCorrect={false}
                onSubmitEditing={join}
                style={[styles.input, styles.codeInput]}
              />
              <Button label="Join" variant="outline" size="medium" onPress={join} loading={joining} />
            </View>
          </View>

          <ErrorText message={error} />

          <Text style={styles.credits}>
            Word pictures: Twemoji by Twitter and contributors, CC-BY 4.0 (twemoji.twitter.com)
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 32, gap: 24 },
  hero: { alignItems: 'center', gap: 12, paddingTop: 16 },
  logo: {
    width: 112,
    height: 112,
    borderRadius: 32,
    backgroundColor: colors.yellow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: fonts.display, fontSize: 40, color: colors.green },
  tagline: { fontFamily: fonts.body, fontSize: 16, color: colors.muted, textAlign: 'center' },
  field: { gap: 8 },
  fieldLabel: { fontSize: 14 },
  input: {
    height: 52,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 16,
    fontFamily: fonts.bodySemi,
    fontSize: 17,
    color: colors.ink,
  },
  codeInput: { flex: 1, minWidth: 0, fontFamily: fonts.bodyBold, fontSize: 18, letterSpacing: 2 },
  joinRow: { flexDirection: 'row', gap: 10 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 2, backgroundColor: colors.border },
  dividerText: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.muted },
  credits: { fontFamily: fonts.body, fontSize: 11, color: colors.muted, textAlign: 'center', marginTop: 8 },
});
