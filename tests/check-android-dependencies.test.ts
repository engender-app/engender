import { describe, expect, it } from 'vitest';
import { forbiddenDependencies } from '../scripts/check-android-dependencies.mjs';

describe('forbiddenDependencies', () => {
  it('reports Firebase and Play Services dependencies in a Gradle graph', () => {
    const graph = [
      '+--- com.google.firebase:firebase-messaging:24.0.0',
      '|    \\--- com.google.android.gms:play-services-basement:18.5.0',
      '\\--- androidx.core:core-ktx:1.17.0'
    ].join('\n');
    expect(forbiddenDependencies(graph)).toEqual([
      'com.google.android.gms:play-services-basement:18.5.0',
      'com.google.firebase:firebase-messaging:24.0.0'
    ]);
  });

  it('returns an empty list for an allowed graph', () => {
    const graph = [
      '+--- androidx.core:core-ktx:1.17.0',
      '+--- androidx.biometric:biometric:1.1.0',
      '\\--- net.zetetic:sqlcipher-android:4.9.0'
    ].join('\n');
    expect(forbiddenDependencies(graph)).toEqual([]);
  });
});
