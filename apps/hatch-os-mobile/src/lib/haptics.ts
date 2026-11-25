import * as Haptics from "expo-haptics";

let enabled = true;

export function setHapticsEnabled(value: boolean): void {
  enabled = value;
}

async function run(effect: () => Promise<void>): Promise<void> {
  if (!enabled) return;
  try {
    await effect();
  } catch {
    /* Web and simulators can omit the haptic engine. */
  }
}

export function hapticSelection(): Promise<void> {
  return run(() => Haptics.selectionAsync());
}

export function hapticLight(): Promise<void> {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticMedium(): Promise<void> {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export function hapticRigid(): Promise<void> {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid));
}

export function hapticSuccess(): Promise<void> {
  return run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

export function hapticWarning(): Promise<void> {
  return run(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}
