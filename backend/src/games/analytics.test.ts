import { describe, expect, it } from 'vitest';
import { derivedBidAggregates, derivedEntryOutcome } from './analytics';

describe('derivedBidAggregates', () => {
  it('is null until every bid is present', () => {
    expect(derivedBidAggregates(7, [2, 1, null])).toEqual({
      bidSum: null,
      bidDeficit: null,
    });
  });

  it('sums bids and deficit from raw values', () => {
    expect(derivedBidAggregates(7, [2, 1, 3])).toEqual({
      bidSum: 6,
      bidDeficit: 1,
    });
  });
});

describe('derivedEntryOutcome', () => {
  it('is empty with no bid', () => {
    expect(derivedEntryOutcome(null, null)).toEqual({
      made: null,
      trickDelta: null,
      absDelta: null,
      isNilBid: null,
      isNilMade: null,
    });
  });

  it('flags a nil bid before tricks are in', () => {
    expect(derivedEntryOutcome(0, null).isNilBid).toBe(true);
    expect(derivedEntryOutcome(0, null).made).toBeNull();
  });

  it('computes made / delta / nil from bid and tricks', () => {
    expect(derivedEntryOutcome(2, 2)).toMatchObject({
      made: true,
      trickDelta: 0,
      absDelta: 0,
      isNilBid: false,
      isNilMade: false,
    });
    expect(derivedEntryOutcome(0, 0)).toMatchObject({
      made: true,
      isNilBid: true,
      isNilMade: true,
    });
    expect(derivedEntryOutcome(0, 2)).toMatchObject({
      made: false,
      trickDelta: 2,
      isNilBid: true,
      isNilMade: false,
    });
  });
});
