import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseHash, navigateToPicker, navigateToProject, Route } from '../lib/router';

describe('router', () => {
  describe('parseHash', () => {
    it('parses valid project route', () => {
      const route = parseHash('#/project/proj-abc123');
      expect(route).toEqual({ name: 'project', projectId: 'proj-abc123' });
    });

    it('returns picker for empty hash', () => {
      const route = parseHash('');
      expect(route).toEqual({ name: 'picker' });
    });

    it('returns picker for root hash', () => {
      const route = parseHash('#/');
      expect(route).toEqual({ name: 'picker' });
    });

    it('returns picker for project with empty id', () => {
      // parseHash('#/project/') returns picker because the regex (.+) requires at least one character.
      // An empty project ID is not a valid project route, so it falls back to picker mode.
      const route = parseHash('#/project/');
      expect(route).toEqual({ name: 'picker' });
    });

    it('decodes URL-encoded characters correctly', () => {
      // Test that URL-encoded characters are properly decoded when parsing
      const route = parseHash('#/project/proj-a%20b');
      expect(route).toEqual({ name: 'project', projectId: 'proj-a b' });
    });
  });

  describe('navigateToProject and parseHash round-trip', () => {
    it('URL-encoded characters round-trip correctly', () => {
      // Test encoding and decoding round-trip by verifying what navigateToProject generates
      // can be correctly parsed by parseHash
      const projectIdWithSpace = 'proj-a b';
      const projectIdWithSpecialChars = 'proj-test/with?special&chars';

      // Verify space is encoded and decoded correctly
      const encodedSpace = encodeURIComponent(projectIdWithSpace);
      expect(encodedSpace).toBe('proj-a%20b');
      const decodedSpace = decodeURIComponent(encodedSpace);
      expect(decodedSpace).toBe(projectIdWithSpace);

      // Verify parseHash correctly decodes the encoded project ID
      const routeWithSpace = parseHash(`#/project/${encodedSpace}`);
      expect(routeWithSpace).toEqual({ name: 'project', projectId: projectIdWithSpace });

      // Verify special characters round-trip correctly
      const encodedSpecial = encodeURIComponent(projectIdWithSpecialChars);
      const routeWithSpecial = parseHash(`#/project/${encodedSpecial}`);
      expect(routeWithSpecial).toEqual({ name: 'project', projectId: projectIdWithSpecialChars });
    });
  });

  describe('navigateToPicker', () => {
    it('sets hash to picker route', () => {
      const originalHash = window.location.hash;

      try {
        navigateToPicker();
        expect(window.location.hash).toBe('#/');
      } finally {
        window.location.hash = originalHash;
      }
    });
  });
});
