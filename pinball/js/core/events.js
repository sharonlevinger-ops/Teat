// Minimal synchronous event bus: the only channel from game logic to presentation (graphics, audio, UI).
export class EventBus {
  constructor() { this.map = new Map(); }
  on(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
    return () => this.off(type, fn);
  }
  off(type, fn) {
    const list = this.map.get(type);
    if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
  }
  emit(type, payload) {
    const list = this.map.get(type);
    if (list) for (let i = 0; i < list.length; i++) list[i](payload);
    const all = this.map.get('*');
    if (all) for (let i = 0; i < all.length; i++) all[i](type, payload);
  }
}
