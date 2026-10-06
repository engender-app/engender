import { describe, expect, it } from 'vitest';
import { flagRoles } from '../../theme/roles';
import { roleAttrs } from './role';

/* Trans on the light theme: its blue band is 1.80:1 on a white card, so a
   line in it is edged; on the dark theme the same blue reads by itself. */
const TRANS = ['#5BCEFA', '#F5A9B8', '#FFFFFF', '#F5A9B8', '#5BCEFA'];
const light = flagRoles(TRANS, '#1B2B36', ['#F4F8FB', '#FFFFFF', '#E9F1F7']);
const dark = flagRoles(TRANS, '#E8F1F7', ['#0D141A', '#151F27', '#1D2A34']);

describe('roleAttrs', () => {
  it('hands a line its edge where the stripe needs one', () => {
    const blue = light[0];
    expect(blue.edge).not.toBeNull();
    expect(roleAttrs(blue).style).toContain(`--role-edge-in: ${blue.edge}`);
  });

  it('hands no edge where the stripe already reads, so the line is drawn as before', () => {
    const blue = dark[0];
    expect(blue.edge).toBeNull();
    expect(roleAttrs(blue).style).not.toContain('--role-edge-in');
  });

  it('still opts an uncoloured surface in with no inputs at all', () => {
    expect(roleAttrs(undefined)).toEqual({ 'data-kit-role': '' });
  });
});
