import { describe, expect, it } from 'vitest';
import type { PendingDoc } from '../../../components/Documents';
import { isCheckableType, MAX_PHOTOS, photoKey, QUALITY_TONE, selectPhotos, SEVERITY_TONE } from '../photoSelection';

const file = (name: string, type: string, size = 10) => new File([new Uint8Array(size)], name, { type, lastModified: 1 });
const doc = (f?: File, fileName = f?.name ?? 'saved.jpg'): PendingDoc => ({ key: fileName, category: 'PHOTO', fileName, sizeBytes: f?.size ?? 1, mimeType: f?.type ?? 'image/jpeg', file: f });

describe('isCheckableType', () => {
  it('checks photos for auto and property claims only', () => {
    expect(isCheckableType('AUTO')).toBe(true);
    expect(isCheckableType('PROPERTY')).toBe(true);
    expect(isCheckableType('HEALTH')).toBe(false);
  });
});

describe('selectPhotos', () => {
  it('picks readable image files and ignores documents, videos and uploads without a real file', () => {
    const s = selectPhotos([doc(file('a.jpg', 'image/jpeg')), doc(file('b.pdf', 'application/pdf')), doc(file('c.mp4', 'video/mp4')), doc(undefined, 'saved.jpg'), doc(file('d.png', 'image/png'))]);
    expect(s.files.map((f) => f.name)).toEqual(['a.jpg', 'd.png']);
    expect(s.skipped).toBe(0);
    expect(s.unreadable).toEqual([]);
  });

  it('reports images Ease cannot read, such as iPhone HEIC photos', () => {
    const s = selectPhotos([doc(file('a.jpg', 'image/jpeg')), doc(file('b.heic', 'image/heic'))]);
    expect(s.files.map((f) => f.name)).toEqual(['a.jpg']);
    expect(s.unreadable).toEqual(['b.heic']);
  });

  it('sends at most four photos and says how many were left out', () => {
    const many = Array.from({ length: 6 }, (_, i) => doc(file(`p${i}.jpg`, 'image/jpeg')));
    const s = selectPhotos(many);
    expect(MAX_PHOTOS).toBe(4);
    expect(s.files.map((f) => f.name)).toEqual(['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg']);
    expect(s.skipped).toBe(2);
  });

  it('finds nothing when there are no photos', () => {
    expect(selectPhotos([]).files).toEqual([]);
  });
});

describe('photoKey', () => {
  const a = file('a.jpg', 'image/jpeg', 10);
  it('is the same for the same photos and claim type', () => {
    expect(photoKey('AUTO', [a])).toBe(photoKey('AUTO', [a]));
  });
  it('changes when a photo is added, removed or replaced, or the claim type changes', () => {
    const b = file('b.jpg', 'image/jpeg', 10);
    expect(photoKey('AUTO', [a, b])).not.toBe(photoKey('AUTO', [a]));
    expect(photoKey('AUTO', [b])).not.toBe(photoKey('AUTO', [a]));
    expect(photoKey('AUTO', [file('a.jpg', 'image/jpeg', 99)])).not.toBe(photoKey('AUTO', [a]));
    expect(photoKey('PROPERTY', [a])).not.toBe(photoKey('AUTO', [a]));
  });
});

describe('verdict colours', () => {
  it('shows good as green, ok as amber and poor as red', () => {
    expect([QUALITY_TONE.good, QUALITY_TONE.ok, QUALITY_TONE.poor]).toEqual(['green', 'amber', 'red']);
  });
  it('has a colour for every severity', () => {
    expect(Object.keys(SEVERITY_TONE).sort()).toEqual(['minor', 'moderate', 'severe', 'unclear']);
  });
});
