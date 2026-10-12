import { Redirect, useLocalSearchParams } from 'expo-router';

/** Invite links (drawguess://join/PND482) open the home screen with the code filled in. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/', params: { code: code ?? '' } }} />;
}
