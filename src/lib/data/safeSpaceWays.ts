/* Order the links below Safe Space's breathing exercise. The resource
   directory comes first and is also reachable through More. Good
   moments stays within Safe Space. Keep the Comfort list button above
   the exercise so a person can open it without starting the animation.

   Use the registry to test the order. The screen supplies translated
   labels so this module can run in the Node tier (ADR-0016). */

export type SafeSpaceWayKey = 'resources' | 'evidence';

export type SafeSpaceWay = {
  key: SafeSpaceWayKey;
  /** A name from $lib/components/icons.ts. */
  icon: string;
  href: string;
};

export const SAFE_SPACE_WAYS: readonly SafeSpaceWay[] = [
  { key: 'resources', icon: 'lifebuoy', href: '/support/resources' },
  { key: 'evidence', icon: 'sparkle', href: '/doubt/evidence' }
];
