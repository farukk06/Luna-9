interface Entry { index: number; cost: number; priority: number }

// Lazy duplicates avoid a separate decrease-key index map.
export class MinHeap {
  private entries: Entry[] = [];

  push(entry: Entry): void {
    let i = this.entries.length;
    this.entries.push(entry);
    while (i > 0) {
      const parent = (i - 1) >>> 1;
      if (this.entries[parent].priority <= entry.priority) break;
      this.entries[i] = this.entries[parent];
      i = parent;
    }
    this.entries[i] = entry;
  }

  pop(): Entry | undefined {
    const first = this.entries[0];
    const last = this.entries.pop();
    if (!first || !last || this.entries.length === 0) return first;
    let i = 0;
    while (2 * i + 1 < this.entries.length) {
      let child = 2 * i + 1;
      if (child + 1 < this.entries.length && this.entries[child + 1].priority < this.entries[child].priority) child++;
      if (last.priority <= this.entries[child].priority) break;
      this.entries[i] = this.entries[child];
      i = child;
    }
    this.entries[i] = last;
    return first;
  }
}
