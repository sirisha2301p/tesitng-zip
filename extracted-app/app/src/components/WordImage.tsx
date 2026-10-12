import { useState } from 'react';
import { Image, Platform, View } from 'react-native';
import { SvgUri } from 'react-native-svg';
import { serverUrl } from '../lib/server';
import { colors } from '../theme';
import { Icon } from './Icon';

/** Pictures served by the game server come as "/images/<file>"; anything else is a full URL. */
function resolve(imageUrl: string): string {
  return imageUrl.startsWith('/') ? `${serverUrl()}${imageUrl}` : imageUrl;
}

/**
 * The picture for a word. SVG files need react-native-svg on phones (Image can't draw SVG there);
 * browsers draw them natively. Falls back to a pencil when there is no picture or it fails to load.
 */
export function WordImage({ imageUrl, label, size }: { imageUrl: string | null; label: string; size: number }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const uri = imageUrl ? resolve(imageUrl) : null;

  if (!uri || failedUrl === uri) {
    return <Icon name="pencil" size={size * 0.55} color={colors.ink} strokeWidth={1.8} />;
  }
  if (uri.endsWith('.svg') && Platform.OS !== 'web') {
    return (
      <View accessible accessibilityRole="image" accessibilityLabel={label}>
        <SvgUri uri={uri} width={size} height={size} onError={() => setFailedUrl(uri)} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri }}
      style={{ width: size, height: size }}
      resizeMode="contain"
      accessibilityLabel={label}
      onError={() => setFailedUrl(uri)}
    />
  );
}
