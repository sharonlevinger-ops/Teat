// Rules module – Table 2 "Forest Kingdom": the castle gate and the princess, the prince's shields (drop targets)
// and his quest (hurry-up), the dwarves' mine (7 dwarf lamps → gem jackpot) and the fairy spinner.
// Methods of GameRules (mixed into its prototype in ../rules.js); `this` is the GameRules instance.
// On the Enchanted Forest these targets do not exist, so none of this ever runs there.
import { KINGDOM_RULES as K, secToTicks } from '../config.js';
import { fmt } from './ticks.js';

const KT = {
  GATE_OPEN: secToTicks(K.GATE_OPEN),
  ROYAL_BOOST: secToTicks(K.ROYAL_BOOST),
  SHIELD_RESET: secToTicks(K.SHIELD_RESET),
  QUEST: secToTicks(K.QUEST_SECONDS),
  GATE_CD: secToTicks(0.4),
};

export class KingdomRules {
  _kingdomReset() {
    this.gateHits = 0;
    this.gateTicks = 0;
    this.rescues = 0;
    this.rescueValue = K.RESCUE;
    this.shieldsDown = [false, false, false];
    this.shieldResetTicks = 0;
    this.questTicks = 0;
    this.dwarves = 0;
    this.gemValue = K.GEMS;
  }

  get gateOpen() { return this.gateTicks > 0; }
  get questActive() { return this.questTicks > 0; }
  /** the prince's quest is worth 30,000 falling to 10,000 */
  get questValue() {
    if (!this.questActive) return 0;
    return Math.round((K.QUEST_END + (K.QUEST_START - K.QUEST_END) * (this.questTicks / KT.QUEST)) / 100) * 100;
  }

  /** called every step from update() */
  _kingdomUpdate() {
    if (this.gateTicks > 0 && --this.gateTicks === 0) { this.gateHits = 0; this.ctl.setGate && this.ctl.setGate(false); this.bus.emit('gateClose', {}); }
    if (this.questTicks > 0 && --this.questTicks === 0) this.bus.emit('questEnd', { collected: false });
    if (this.shieldResetTicks > 0 && --this.shieldResetTicks === 0) this._raiseShields();
  }

  /** a lost ball: the gate closes, the quest ends, the shields come back up (dwarves and rescues are kept) */
  _kingdomBallLost() {
    if (this.gateOpen) { this.gateTicks = 0; this.ctl.setGate && this.ctl.setGate(false); this.bus.emit('gateClose', {}); }
    this.gateHits = 0;
    if (this.questActive) { this.questTicks = 0; this.bus.emit('questEnd', { collected: false }); }
    this._raiseShields();
  }

  _raiseShields() {
    this.shieldResetTicks = 0;
    this.shieldsDown = [false, false, false];
    if (this.ctl.setShield) for (let i = 1; i <= 3; i++) this.ctl.setShield(i, true);
    this.bus.emit('shieldsUp', {});
  }

  /** what to go for on this table (or null), used by the goal line */
  _kingdomGoal() {
    if (this.questActive) return { text: `PRINCE'S QUEST · HIT THE CASTLE GATE · ${fmt(this.questValue)}`, target: 'castle' };
    if (this.gateOpen) return { text: `RESCUE THE PRINCESS · SHOOT INTO THE CASTLE · ${fmt(this.rescueValue)}`, target: 'castle' };
    if (this.dwarves === K.DWARVES - 1) return { text: `ONE MORE DWARF · SHOOT THE MINE · GEMS ${fmt(this.gemValue)}`, target: 'mine' };
    return null;
  }

  // ---------------------------------------------------------------- the castle
  onCastleGate(x, y) {
    if (!this._cool('castleGate', KT.GATE_CD)) return;
    this.award(K.GATE_HIT_POINTS, 'castleGate', x, y);
    this._dragonHit('castleGate', x, y);
    this.bus.emit('castleGateHit', { x, y });
    if (this.questActive) { // the prince reaches the castle
      const points = this.award(this.questValue, 'princeQuest', x, y);
      this.questTicks = 0;
      this.bus.emit('questEnd', { collected: true, points });
    }
    if (this.gateOpen || this.tilted) return;
    this.gateHits = Math.min(K.GATE_HITS, this.gateHits + 1);
    this.bus.emit('gateCharge', { hits: this.gateHits, of: K.GATE_HITS });
    if (this.gateHits >= K.GATE_HITS) {
      this.gateTicks = KT.GATE_OPEN;
      this.ctl.setGate && this.ctl.setGate(true);
      this.bus.emit('gateOpen', { seconds: K.GATE_OPEN });
    }
  }

  onCastleEnter(ball) {
    if (!this.gateOpen || this.tilted) { this.ctl.ejectFromCastle(ball, 0.6); return; }
    this.gateTicks = 0;
    this.gateHits = 0;
    this.ctl.setGate && this.ctl.setGate(false);
    this.bus.emit('gateClose', {});
    this.rescues++;
    const points = this.award(this.rescueValue, 'princessRescue');
    this.rescueValue = Math.min(K.RESCUE_MAX, this.rescueValue + K.RESCUE_STEP);
    if (!this.rushActive) { this.boostTicks = Math.max(this.boostTicks, KT.ROYAL_BOOST); this.bus.emit('boostStart', { seconds: K.ROYAL_BOOST }); }
    this._dragonHit('castleGate');
    this.bus.emit('princessRescued', { count: this.rescues, points });
    this.ctl.ejectFromCastle(ball, K.CASTLE_HOLD);
  }

  // ---------------------------------------------------------------- the prince's shields (drop targets)
  /** returns false when the shield was already down (the ball passed where it stood) */
  onShield(id, x, y) {
    const i = Number(id.slice(-1)) - 1;
    if (this.shieldsDown[i]) return false;
    this.shieldsDown[i] = true;
    this.ctl.setShield && this.ctl.setShield(i + 1, false);
    this.award(K.SHIELD_POINTS, 'shield', x, y);
    this.bus.emit('shieldDown', { index: i, x, y });
    if (this.shieldsDown.every(Boolean)) {
      this.questTicks = KT.QUEST;
      this.shieldResetTicks = KT.SHIELD_RESET;
      this.bus.emit('princeQuest', { seconds: K.QUEST_SECONDS, value: K.QUEST_START });
    }
    return true;
  }

  // ---------------------------------------------------------------- the dwarves' mine
  onMine() {
    if (this.state !== 'playing') return;
    this.award(K.MINE_POINTS, 'mine');
    this._bonus('scoop');
    if (this.tilted) return;
    this.dwarves = Math.min(K.DWARVES, this.dwarves + 1);
    this.bus.emit('dwarfLit', { count: this.dwarves, of: K.DWARVES });
    if (this.dwarves >= K.DWARVES) {
      const points = this.award(this.gemValue, 'gemJackpot');
      this.gemValue = Math.min(K.GEMS_MAX, this.gemValue + K.GEMS_STEP);
      this.dwarves = 0;
      this.bus.emit('gemJackpot', { points });
    }
  }

  // ---------------------------------------------------------------- the fairy spinner
  onSpinner(speed) {
    if (this.state !== 'playing' || !this._cool('spinner', secToTicks(0.3))) return;
    const spins = Math.max(1, Math.min(K.SPIN_MAX, Math.round(speed / 6)));
    this.award(K.SPIN_POINTS * spins, 'spinner');
    this.bus.emit('spin', { spins });
  }
}
