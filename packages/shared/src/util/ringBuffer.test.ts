import { describe, expect, it } from 'vitest';
import { RingBuffer } from './ringBuffer';

describe('RingBuffer', () => {
  it('keeps items in order until full', () => {
    const rb = new RingBuffer<number>(3);
    expect(rb.size).toBe(0);
    expect(rb.newest()).toBeUndefined();
    rb.push(1);
    rb.push(2);
    expect(rb.toArray()).toEqual([1, 2]);
    expect(rb.oldest()).toBe(1);
    expect(rb.newest()).toBe(2);
  });

  it('drops the oldest when full', () => {
    const rb = new RingBuffer<number>(3);
    for (let i = 1; i <= 7; i++) rb.push(i);
    expect(rb.size).toBe(3);
    expect(rb.toArray()).toEqual([5, 6, 7]);
    expect(rb.get(0)).toBe(5);
    expect(rb.get(2)).toBe(7);
    expect(rb.get(3)).toBeUndefined();
    expect(rb.get(-1)).toBeUndefined();
  });

  it('clears', () => {
    const rb = new RingBuffer<string>(2);
    rb.push('a');
    rb.push('b');
    rb.push('c');
    rb.clear();
    expect(rb.size).toBe(0);
    rb.push('d');
    expect(rb.toArray()).toEqual(['d']);
  });

  it('rejects a bad capacity', () => {
    expect(() => new RingBuffer(0)).toThrow();
    expect(() => new RingBuffer(1.5)).toThrow();
  });
});
