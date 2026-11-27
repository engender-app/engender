/* The Capacitor end of the StepBack plugin; what it does is in./step-preview.ts. */

import { androidPluginOwners, registerAndroidPlugin } from '$lib/android/plugin-registry';
import type { StepBackBridge } from './step-preview';

export const androidStepBack = registerAndroidPlugin<StepBackBridge>(androidPluginOwners.stepBack);
