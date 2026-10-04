/**
 * Fixed-size buffer that keeps the newest `capacity` items and drops the oldest.
 * Used for snapshot history (interpolation), input history and rolling stats.
 */
export class RingBuffer<T> {
  private readonly items: (T | undefined)[];
  private start = 0;
  private count = 0;

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new Error(`RingBuffer capacity must be a positive integer, got ${capacity}`);
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get size(): number {
    return this.count;
  }

  /** Add an item. When full, the oldest item is dropped. */
  push(item: T): void {
    const end = (this.start + this.count) % this.capacity;
    this.items[end] = item;
    if (this.count < this.capacity) this.count++;
    else this.start = (this.start + 1) % this.capacity;
  }

  /** Item by age: 0 is the oldest, `size - 1` the newest. Undefined when out of range. */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) return undefined;
    return this.items[(this.start + index) % this.capacity];
  }

  oldest(): T | undefined {
    return this.get(0);
  }

  newest(): T | undefined {
    return this.get(this.count - 1);
  }

  clear(): void {
    this.items.fill(undefined);
    this.start = 0;
    this.count = 0;
  }

  /** Oldest to newest. */
  *[Symbol.iterator](): IterableIterator<T> {
    for (let i = 0; i < this.count; i++) yield this.items[(this.start + i) % this.capacity] as T;
  }

  toArray(): T[] {
    return [...this];
  }
}
