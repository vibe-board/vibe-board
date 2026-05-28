import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  SEEN_APPROVALS_KEY,
  loadSeenApprovals,
  markApprovalsSeen,
  pruneSeenApprovals,
} from '../seenApprovalsStorage';

describe('seenApprovalsStorage', () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    localStorage.clear();
  });

  it('returns an empty map when nothing is stored', () => {
    expect(loadSeenApprovals()).toEqual({});
  });

  it('returns an empty map when stored value is corrupt JSON', () => {
    localStorage.setItem(SEEN_APPROVALS_KEY, '{not json');
    expect(loadSeenApprovals()).toEqual({});
  });

  it('markApprovalsSeen writes ids with the provided timestamp and merges with existing', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen(['b', 'c'], 2000);
    expect(loadSeenApprovals()).toEqual({ a: 1000, b: 2000, c: 2000 });
  });

  it('markApprovalsSeen overwrites the timestamp for an id seen again', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen(['a'], 2000);
    expect(loadSeenApprovals()).toEqual({ a: 2000 });
  });

  it('markApprovalsSeen with an empty array is a no-op', () => {
    markApprovalsSeen(['a'], 1000);
    markApprovalsSeen([], 9999);
    expect(loadSeenApprovals()).toEqual({ a: 1000 });
  });

  it('pruneSeenApprovals keeps only ids in the live set', () => {
    markApprovalsSeen(['a', 'b', 'c'], 1000);
    pruneSeenApprovals(new Set(['b']));
    expect(loadSeenApprovals()).toEqual({ b: 1000 });
  });

  it('pruneSeenApprovals does not touch storage when nothing would change', () => {
    markApprovalsSeen(['a'], 1000);
    const before = localStorage.getItem(SEEN_APPROVALS_KEY);
    pruneSeenApprovals(new Set(['a']));
    expect(localStorage.getItem(SEEN_APPROVALS_KEY)).toBe(before);
  });

  it('survives a throwing localStorage.setItem without crashing', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error('quota exceeded');
    };
    try {
      expect(() => markApprovalsSeen(['a'], 1000)).not.toThrow();
      expect(loadSeenApprovals()).toEqual({});
    } finally {
      Storage.prototype.setItem = original;
    }
  });
});
