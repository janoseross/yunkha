import {
  ArrowLeft, Battery, Camera, Check, CircleAlert, Monitor, Play, Settings2, ShieldCheck, Wifi,
} from 'lucide-react-native';
import { useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { AppText, AppTextInput, Button, Card, IconButton, StatusIndicator } from './components';
import { colors, layout, primitives, tokens, typography } from './tokens';
import type { TextVariant } from './tokens';

const primitiveSwatches = Object.entries(primitives.color);
const semanticSwatches = Object.entries(colors);
const textVariants = Object.keys(typography) as TextVariant[];
const statuses = ['connected', 'connecting', 'waiting', 'disconnected', 'error'] as const;

function Section({ eyebrow, title, children }: { eyebrow: string; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="metadata" tone="success">{eyebrow.toUpperCase()}</AppText>
      <AppText variant="heading">{title}</AppText>
      {children}
    </View>
  );
}

function Swatch({ name, value }: { name: string; value: string }) {
  return (
    <View style={[styles.swatch, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[styles.swatchColor, { backgroundColor: value, borderColor: colors.border }]} />
      <View style={styles.swatchCopy}>
        <AppText variant="label" numberOfLines={1}>{name}</AppText>
        <AppText variant="caption" tone="textSecondary">{value}</AppText>
      </View>
    </View>
  );
}

export default function DesignSystemShowcase({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('Studio camera');
  const [empty, setEmpty] = useState('');
  const [focused, setFocused] = useState('');
  const [feedback, setFeedback] = useState('Try a button to see its response.');
  const focusInput = useRef<TextInput>(null);

  return (
    <ScrollView style={[styles.screen, { backgroundColor: colors.background }]} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.topbar}>
        <IconButton icon={ArrowLeft} accessibilityLabel="Back to Yunkha" variant="surface" onPress={onClose} />
        <AppText variant="metadata" tone="textSecondary">YUNKHA / DEV</AppText>
      </View>

      <View style={styles.hero}>
        <View style={[styles.heroMark, { backgroundColor: colors.surfaceElevated }]}><Camera size={tokens.icons.size.hero} strokeWidth={tokens.icons.stroke.regular} color={colors.success} /></View>
        <AppText variant="display">Design system</AppText>
        <AppText tone="textSecondary">Dark Technical · forest green. A working preview of the building blocks for Yunkha’s next screens.</AppText>
      </View>

      <Section eyebrow="01 / palette" title="Color">
        <AppText variant="bodyMedium">Primitive</AppText>
        <View style={styles.swatchGrid}>{primitiveSwatches.map(([name, value]) => <Swatch key={name} name={name} value={value} />)}</View>
        <AppText variant="bodyMedium">Semantic</AppText>
        <View style={styles.swatchGrid}>{semanticSwatches.map(([name, value]) => <Swatch key={name} name={name} value={value} />)}</View>
      </Section>

      <Section eyebrow="02 / type" title="Typography">
        <Card style={styles.stack}>
          {textVariants.map((variant) => (
            <View key={variant} style={[styles.typeRow, { borderBottomColor: colors.border }]}>
              <AppText variant="metadata" tone="textSecondary">{variant.toUpperCase()}</AppText>
              <AppText variant={variant}>Monitor the moment</AppText>
            </View>
          ))}
        </Card>
        <Card style={styles.stack}>
          {Object.entries(primitives.fontFamily).map(([weight, fontFamily]) => (
            <View key={weight} style={styles.weightRow}>
              <AppText variant="caption" tone="textSecondary">{weight}</AppText>
              <AppText style={{ fontFamily }}>Clear picture, calm interface</AppText>
            </View>
          ))}
        </Card>
      </Section>

      <Section eyebrow="03 / actions" title="Buttons">
        <View style={styles.buttonRow}>
          <Button label="Start camera" icon={Play} onPress={() => setFeedback('Camera action pressed.')} />
          <Button label="Settings" variant="secondary" icon={Settings2} onPress={() => setFeedback('Settings action pressed.')} />
        </View>
        <View style={styles.buttonRow}>
          <Button label="Leave room" variant="destructive" onPress={() => setFeedback('Leave action pressed.')} />
          <Button label="Unavailable" disabled onPress={() => {}} />
        </View>
        <Button label="Connecting" loading onPress={() => {}} />
        <AppText variant="caption" tone="textSecondary">{feedback}</AppText>
        <View style={styles.iconRow}>
          <IconButton icon={Camera} accessibilityLabel="Camera action" variant="surface" onPress={() => setFeedback('Camera icon pressed.')} />
          <IconButton icon={Monitor} accessibilityLabel="Monitor action" variant="surface" onPress={() => setFeedback('Monitor icon pressed.')} />
          <IconButton icon={Settings2} accessibilityLabel="Settings action" variant="surface" disabled />
        </View>
      </Section>

      <Section eyebrow="04 / forms" title="Inputs">
        <AppTextInput label="Empty" placeholder="Enter a room name" value={empty} onChangeText={setEmpty} hint="This field is editable." />
        <AppTextInput label="Populated" value={name} onChangeText={setName} />
        <AppTextInput ref={focusInput} label="Focus state" placeholder="Tap here or use the button" value={focused} onChangeText={setFocused} />
        <Button label="Focus input" variant="secondary" onPress={() => focusInput.current?.focus()} />
        <AppTextInput label="Disabled" value="Unavailable while streaming" editable={false} />
        <AppTextInput label="Error" value="AB1O" error="Use four letters; I and O are excluded." editable={false} />
      </Section>

      <Section eyebrow="05 / surfaces" title="Cards">
        <Card style={styles.cardContent}>
          <View style={styles.cardTitle}><Camera size={tokens.icons.size.large} color={colors.success} strokeWidth={tokens.icons.stroke.regular} /><AppText variant="title">Camera ready</AppText></View>
          <AppText tone="textSecondary">Share the room code to start a direct video connection.</AppText>
          <StatusIndicator status="waiting" label="Waiting for monitor" />
        </Card>
        <Card elevated style={styles.cardContent}>
          <View style={styles.cardTitle}><ShieldCheck size={tokens.icons.size.large} color={colors.success} strokeWidth={tokens.icons.stroke.regular} /><AppText variant="title">Direct connection</AppText></View>
          <AppText tone="textSecondary">Video travels between devices. The server only exchanges signaling messages.</AppText>
          <StatusIndicator status="connected" />
        </Card>
      </Section>

      <Section eyebrow="06 / state" title="Status">
        <Card style={styles.statusGrid}>{statuses.map((status) => <StatusIndicator key={status} status={status} />)}</Card>
      </Section>

      <Section eyebrow="07 / symbols" title="Icons">
        <Card style={styles.iconSamples}>
          {[Camera, Monitor, Wifi, Battery, CircleAlert, Check].map((Icon, index) => (
            <View key={index} style={[styles.iconSample, { backgroundColor: colors.surfaceElevated }]}>
              <Icon size={index % 2 === 0 ? tokens.icons.size.large : tokens.icons.size.medium} color={colors.textSecondary} strokeWidth={tokens.icons.stroke.regular} />
            </View>
          ))}
        </Card>
        <AppText variant="caption" tone="textSecondary">Outlined strokes · {tokens.icons.stroke.regular}px standard</AppText>
      </Section>

      <Section eyebrow="08 / rhythm" title="Spacing & radii">
        <Card style={styles.stack}>
          {Object.entries(tokens.spacing).filter(([, value]) => value > 0).map(([name, value]) => (
            <View key={name} style={styles.scaleRow}>
              <AppText variant="caption" tone="textSecondary" style={styles.scaleLabel}>{name}</AppText>
              <View style={[styles.scaleBar, { width: value * 3, backgroundColor: colors.primary }]} />
              <AppText variant="caption" tone="textSecondary">{value}px</AppText>
            </View>
          ))}
        </Card>
        <View style={styles.radiusRow}>
          {Object.entries(tokens.radii).filter(([name]) => name !== 'none').map(([name, value]) => (
            <View key={name} style={styles.radiusItem}>
              <View style={[styles.radiusBox, { borderRadius: value, backgroundColor: colors.surfaceElevated, borderColor: colors.border }]} />
              <AppText variant="caption" tone="textSecondary">{name}</AppText>
            </View>
          ))}
        </View>
      </Section>

      <AppText variant="metadata" tone="textDisabled" style={styles.footer}>YUNKHA DESIGN SYSTEM · DAY 1</AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: layout.screenPadding, paddingTop: tokens.spacing.x4, paddingBottom: tokens.spacing.x12, gap: layout.sectionGap, maxWidth: layout.contentMaxWidth, width: '100%', alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  hero: { gap: tokens.spacing.x3, paddingTop: tokens.spacing.x4 },
  heroMark: { width: tokens.spacing.x12, height: tokens.spacing.x12, borderRadius: tokens.radii.medium, alignItems: 'center', justifyContent: 'center' },
  section: { gap: tokens.spacing.x4 },
  swatchGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.x2 },
  swatch: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x2, width: '48%', minWidth: layout.swatchMinWidth, padding: tokens.spacing.x2, borderRadius: tokens.radii.medium, borderWidth: tokens.borderWidths.hairline },
  swatchColor: { width: tokens.spacing.x8, height: tokens.spacing.x8, borderRadius: tokens.radii.small, borderWidth: tokens.borderWidths.hairline },
  swatchCopy: { flex: 1 },
  stack: { gap: tokens.spacing.x4 },
  typeRow: { gap: tokens.spacing.x1, borderBottomWidth: tokens.borderWidths.hairline, paddingBottom: tokens.spacing.x3 },
  weightRow: { gap: tokens.spacing.x1 },
  buttonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.x2 },
  iconRow: { flexDirection: 'row', gap: tokens.spacing.x2 },
  cardContent: { gap: tokens.spacing.x3 },
  cardTitle: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x2 },
  statusGrid: { gap: tokens.spacing.x4 },
  iconSamples: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.x4 },
  iconSample: { width: layout.touchTarget, height: layout.touchTarget, alignItems: 'center', justifyContent: 'center', borderRadius: tokens.radii.medium },
  scaleRow: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.x2 },
  scaleLabel: { width: tokens.spacing.x8 },
  scaleBar: { height: tokens.spacing.x2, borderRadius: tokens.radii.pill },
  radiusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.x4 },
  radiusItem: { gap: tokens.spacing.x2, alignItems: 'center' },
  radiusBox: { width: tokens.spacing.x12, height: tokens.spacing.x12, borderWidth: tokens.borderWidths.hairline },
  footer: { textAlign: 'center', paddingTop: tokens.spacing.x4 },
});
