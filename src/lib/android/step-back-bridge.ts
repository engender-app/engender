/* Capacitor bridge for StepBack. ./step-preview.ts owns the transition. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { StepBackBridge } from './step-preview';

export const androidStepBack = registerAndroidPlugin<StepBackBridge>(androidPluginOwners.stepBack);
