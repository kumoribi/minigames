const F = ['🀄', '🀅', '🀆', '🀀', '🀁', '🀂', '🀃', '🀇', '🀈', '🀉', '🀐', '🀑', '🀒', '🀙', '🀚', '🀛', '🀢', '🀥'];
const PEAKS = {
  4: [[2, 1], [2, 1]],
  6: [[2, 2], [2, 1]],
  8: [[2, 2], [2, 1], [2, 1]],
  10: [[2, 3], [2, 1], [2, 1]],
  12: [[2, 3], [2, 2], [2, 1]],
  14: [[2, 3], [2, 2], [2, 1], [2, 1]],
  16: [[3, 2], [2, 2], [2, 1], [2, 1], [2, 1]],
};
const CFG = {
  easy: { cols: 6, rows: 4, mountains: [[8, 8], [6, 6, 4]], mult: 1 },
  normal: { cols: 8, rows: 5, mountains: [[12, 12, 12], [10, 10, 8, 8], [8, 8, 8, 6, 6]], mult: 1.5 },
  hard: { cols: 8, rows: 6, mountains: [[16, 16, 16, 16], [14, 14, 12, 12, 12], [12, 12, 10, 10, 10, 10]], mult: 2 },
};
const MAX_EFFECTS = 64;
const THEMES = ['jade', 'night', 'plum'];

const board = document.querySelector('#board');
const effectLayer = document.querySelector('#effect-layer');
const confetti = document.querySelector('#confetti');
const msg = document.querySelector('#message');
const difficulty = document.querySelector('#difficulty');
const soundButton = document.querySelector('#sound');
const restartDialog = document.querySelector('#restart-dialog');
const clearDialog = document.querySelector('#dialog');
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let tiles = [];
let selected = null;
let history = [];
let score = 0;
let seconds = 0;
let timer = 0;
let started = false;
let locked = false;
let lastMatch = 0;
let combo = 0;
let comboResetTimer = 0;
let totalTiles = 0;
let audioContext = null;
let level = localStorage.getItem('mahjong-level') || 'easy';
let feedbackOn = localStorage.getItem('mahjong-feedback') !== 'off';

difficulty.value = level;

function shuffle(values) {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function makePeak(dims, ox2, oy2, cfg) {
  const peak = [];
  let parent = null;
  dims.forEach(([width, height], index) => {
    let x2 = ox2;
    let y2 = oy2;
    if (parent) {
      const candidates = [];
      for (let x = parent.x2 - 1; x <= parent.x2 + (parent.w - width) * 2 + 1; x += 2) {
        if (x >= 0 && x + width * 2 <= cfg.cols * 2) candidates.push(x);
      }
      x2 = shuffle(candidates)[0];
      y2 = parent.y2 + 2 * Math.floor(Math.random() * (parent.h - height + 1));
    }
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) peak.push({ x2: x2 + col * 2, y2: y2 + row * 2, z: index + 1 });
    }
    parent = { x2, y2, w: width, h: height };
  });
  return peak;
}

function peakSlots(peaks, cfg) {
  const counts = peaks.length < 3 ? [peaks.length] : peaks.length < 5 ? [2, peaks.length - 2] : [3, peaks.length - 3];
  const slots = [];
  let at = 0;
  counts.forEach((count, row) => {
    for (let i = 0; i < count; i++) {
      const peak = peaks[at++];
      const width = peak[0][0];
      const height = peak[0][1];
      const centerX = (i + .5) * cfg.cols / count;
      const centerY = (row + .5) * cfg.rows / counts.length;
      let x2 = Math.round(centerX * 2 - width);
      let y2 = Math.round(centerY * 2 - height);
      if (x2 % 2 === 0) x2 += x2 < centerX * 2 - width ? 1 : -1;
      if (y2 % 2) y2 += y2 < centerY * 2 - height ? 1 : -1;
      x2 = Math.max(1, Math.min(cfg.cols * 2 - width * 2 - 1, x2));
      y2 = Math.max(0, Math.min(cfg.rows * 2 - height * 2, y2));
      slots.push({ peak, x2, y2 });
    }
  });
  return slots;
}

function positions() {
  const cfg = CFG[level];
  const cuts = new Set([`0/0`, `${cfg.cols - 1}/0`, `0/${cfg.rows - 1}`, `${cfg.cols - 1}/${cfg.rows - 1}`]);
  for (let attempt = 0; attempt < 120; attempt++) {
    const base = [];
    for (let y = 0; y < cfg.rows; y++) {
      for (let x = 0; x < cfg.cols; x++) {
        if (!cuts.has(`${x}/${y}`)) base.push({ x2: x * 2, y2: y * 2, z: 0 });
      }
    }
    const sizes = shuffle(cfg.mountains[Math.floor(Math.random() * cfg.mountains.length)]);
    const slots = peakSlots(sizes.map(size => PEAKS[size]), cfg);
    const result = [...base];
    let valid = true;
    for (const slot of slots) {
      const peak = makePeak(slot.peak, slot.x2, slot.y2, cfg);
      const supported = [...result, ...peak];
      if (peak.some(tile => !supported.some(other => other !== tile && other.z === tile.z - 1 && overlap(tile, other)) || result.some(other => other.z === tile.z && overlap(tile, other)))) {
        valid = false;
        break;
      }
      result.push(...peak);
    }
    if (valid) {
      board.dataset.cols = cfg.cols;
      board.dataset.rows = cfg.rows;
      board.dataset.mountains = sizes.length;
      return result;
    }
  }
  throw new Error('山を生成できませんでした');
}

function overlap(a, b) {
  return a.x2 < b.x2 + 2 && a.x2 + 2 > b.x2 && a.y2 < b.y2 + 2 && a.y2 + 2 > b.y2;
}

function free(tile, list = tiles) {
  if (!tile.active) return false;
  const active = list.filter(other => other.active && other.id !== tile.id);
  const above = active.some(other => other.z > tile.z && overlap(tile, other));
  const vertical = other => tile.y2 < other.y2 + 2 && tile.y2 + 2 > other.y2;
  const left = active.some(other => other.z === tile.z && vertical(other) && other.x2 < tile.x2 && other.x2 + 2 >= tile.x2);
  const right = active.some(other => other.z === tile.z && vertical(other) && other.x2 > tile.x2 && tile.x2 + 2 >= other.x2);
  return !above && (!left || !right);
}

function assign(list) {
  const simulation = list.map(tile => ({ ...tile, active: true }));
  const pairs = [];
  while (simulation.some(tile => tile.active)) {
    const candidates = shuffle(simulation.filter(tile => free(tile, simulation)));
    if (candidates.length < 2) return false;
    candidates[0].active = false;
    candidates[1].active = false;
    pairs.push([candidates[0].id, candidates[1].id]);
  }
  shuffle(pairs).forEach((pair, index) => pair.forEach(id => {
    list.find(tile => tile.id === id).face = F[index % F.length];
  }));
  return true;
}

function family(face) {
  const code = face.codePointAt(0);
  if (face === '🀄') return 'dragon';
  if (code >= 0x1f007 && code <= 0x1f00f) return 'man';
  if (code >= 0x1f010 && code <= 0x1f018) return 'bamboo';
  if (code >= 0x1f019 && code <= 0x1f021) return 'dot';
  return 'honor';
}

function activeTiles() {
  return tiles.filter(tile => tile.active);
}

function availablePairs() {
  const groups = new Map();
  activeTiles().filter(tile => free(tile)).forEach(tile => groups.set(tile.face, (groups.get(tile.face) || 0) + 1));
  return [...groups.values()].reduce((sum, count) => sum + Math.floor(count / 2), 0);
}

function setMessage(text, tone = '') {
  msg.textContent = text;
  if (tone) msg.dataset.tone = tone;
  else delete msg.dataset.tone;
}

function updateSoundButton() {
  soundButton.setAttribute('aria-pressed', String(feedbackOn));
  soundButton.querySelector('span').textContent = feedbackOn ? '🔊' : '🔇';
  soundButton.title = feedbackOn ? '効果音と振動：オン' : '効果音と振動：オフ';
}

function ensureAudio() {
  if (!feedbackOn) return null;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return null;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') audioContext.resume();
  return audioContext;
}

function tone(frequency, duration = .07, type = 'sine', volume = .025, delay = 0) {
  const audio = ensureAudio();
  if (!audio) return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  const startAt = audio.currentTime + delay;
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gain.gain.setValueAtTime(.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(volume, startAt + .008);
  gain.gain.exponentialRampToValueAtTime(.0001, startAt + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + .02);
}

function playSound(kind, value = 1) {
  if (!feedbackOn) return;
  if (kind === 'select') tone(420, .045, 'sine', .018);
  if (kind === 'invalid') tone(155, .09, 'triangle', .018);
  if (kind === 'mismatch') { tone(260, .07, 'triangle', .018); tone(215, .09, 'triangle', .014, .06); }
  if (kind === 'match') {
    const base = Math.min(790, 480 + value * 55);
    tone(base, .1, 'sine', .03);
    tone(base * 1.5, .13, 'sine', .022, .055);
    if (value >= 3) tone(base * 2, .16, 'sine', .014, .11);
  }
  if (kind === 'reveal') tone(690, .09, 'sine', .014);
  if (kind === 'shuffle') { tone(280, .08, 'triangle', .018); tone(360, .1, 'triangle', .016, .08); }
  if (kind === 'undo') tone(330, .08, 'sine', .016);
  if (kind === 'clear') {
    [523, 659, 784, 1047].forEach((frequency, index) => tone(frequency, .28, 'sine', .026, index * .09));
  }
}

function vibrate(pattern) {
  if (feedbackOn && !reduceMotion.matches && navigator.vibrate) navigator.vibrate(pattern);
}

function newGame() {
  clearInterval(timer);
  clearTimeout(comboResetTimer);
  do {
    tiles = positions().map((position, id) => ({ ...position, id, active: true, face: '', revealed: false }));
  } while (!assign(tiles));
  selected = null;
  history = [];
  score = 0;
  seconds = 0;
  combo = 0;
  lastMatch = 0;
  started = false;
  locked = false;
  totalTiles = tiles.length;
  clearDialog.hidden = true;
  restartDialog.hidden = true;
  effectLayer.replaceChildren();
  confetti.replaceChildren();
  const boardNumber = Math.floor(100000 + Math.random() * 900000);
  document.querySelector('#board-id').textContent = `山 #${boardNumber}`;
  board.dataset.theme = THEMES[boardNumber % THEMES.length];
  board.classList.remove('endgame', 'shuffling');
  setMessage('表向きの牌を1枚選んでください');
  render();
}

function render() {
  board.querySelectorAll('.tile').forEach(element => element.remove());
  const cols = Number(board.dataset.cols);
  const rows = Number(board.dataset.rows);
  const tileWidth = 96 / cols;
  const tileHeight = 90 / rows;
  const aspect = Math.max(1.02, Math.min(1.26, cols / rows * .78));
  board.style.aspectRatio = aspect;
  const revealedElements = [];
  let revealIndex = 0;

  activeTiles().forEach(tile => {
    const available = free(tile);
    const reveal = available && !tile.revealed;
    if (available) tile.revealed = true;
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.id = tile.id;
    button.dataset.layer = tile.z;
    button.className = `tile ${available ? 'free' : 'blocked'}${selected === tile.id ? ' selected' : ''}${reveal ? ' reveal' : ''}`;
    button.style.width = `${tileWidth}%`;
    button.style.height = `${tileHeight}%`;
    button.style.left = `${2 + tile.x2 * tileWidth / 2}%`;
    button.style.top = `${5 + tile.y2 * tileHeight / 2}%`;
    button.style.setProperty('--z', 10 + tile.z * 20 + tile.y2 / 2);
    button.style.setProperty('--side-depth', `${4 + tile.z * .8}px`);
    button.style.setProperty('--shadow-y', `${8 + tile.z * 1.5}px`);
    button.style.setProperty('--shadow-blur', `${7 + tile.z}px`);
    button.style.setProperty('--shuffle-order', Math.floor(Math.random() * 8));
    if (reveal) button.style.setProperty('--reveal-delay', `${Math.min(revealIndex++, 8) * 38}ms`);
    button.setAttribute('aria-pressed', String(selected === tile.id));
    button.setAttribute('aria-label', available ? `取得可能な${tile.face}` : `取得不可の裏向き牌、${tile.z + 1}層目`);
    button.innerHTML = available
      ? `<span class="face ${family(tile.face)}">${tile.face}${selected === tile.id ? '<i class="selection-mark" aria-hidden="true">1</i>' : ''}</span>`
      : '<span class="face back" aria-hidden="true">◆</span>';
    button.onclick = () => choose(tile, button);
    board.append(button);
    if (reveal) revealedElements.push(button);
  });

  updateHUD();
  if (revealedElements.length && started) {
    revealedElements.slice(0, 8).forEach((element, index) => {
      setTimeout(() => revealWave(element), reduceMotion.matches ? 0 : index * 38);
    });
    playSound('reveal');
  }
  return revealedElements.length;
}

function updateHUD() {
  const remaining = activeTiles().length;
  document.querySelector('#remaining').textContent = remaining;
  document.querySelector('#pairs').textContent = availablePairs();
  document.querySelector('#score').textContent = score.toLocaleString('ja-JP');
  document.querySelector('#progress-bar').style.width = `${totalTiles ? (totalTiles - remaining) / totalTiles * 100 : 0}%`;
  document.querySelector('#undo').disabled = !history.length || locked;
  board.classList.toggle('endgame', remaining > 0 && remaining <= 12);
  showTime();
}

function showTime() {
  document.querySelector('#time').textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function start() {
  if (started) return;
  started = true;
  timer = setInterval(() => {
    seconds++;
    showTime();
  }, 1000);
}

function choose(tile, element) {
  if (locked) return;
  if (!free(tile)) {
    element.classList.add('invalid');
    setMessage('この牌は上か左右をふさがれています', 'notice');
    playSound('invalid');
    setTimeout(() => element.classList.remove('invalid'), 340);
    return;
  }

  start();
  if (selected === null) {
    selected = tile.id;
    setMessage('1枚目を選択中。同じ図柄を選んでください');
    playSound('select');
    render();
    return;
  }

  const first = tiles.find(item => item.id === selected);
  if (first.id === tile.id) {
    selected = null;
    setMessage('選択を解除しました');
    playSound('select');
    render();
    return;
  }

  if (first.face !== tile.face) {
    selected = tile.id;
    setMessage('図柄が違います。この牌を1枚目にしました', 'notice');
    playSound('mismatch');
    render();
    const fresh = board.querySelector(`[data-id="${tile.id}"]`);
    fresh?.classList.add('mismatch');
    return;
  }

  locked = true;
  history.push({ ids: [first.id, tile.id], score, combo, lastMatch });
  combo = Date.now() - lastMatch < 2500 ? combo + 1 : 1;
  lastMatch = Date.now();
  const gain = Math.round(100 * combo * CFG[level].mult);
  score += gain;
  selected = null;
  const pair = [first, tile].map(item => board.querySelector(`[data-id="${item.id}"]`));
  pair.forEach((node, index) => {
    node.classList.add('matched');
    node.style.setProperty('--vanish-rotate', `${index ? 7 : -7}deg`);
  });
  showMatchEffects(pair, gain, combo);
  showCombo(combo);
  playSound('match', combo);
  vibrate(combo >= 3 ? [18, 32, 22] : 18);
  setMessage(combo >= 2 ? `${combo}コンボ！ +${gain}点` : `ペア成立！ +${gain}点`, 'success');

  clearTimeout(comboResetTimer);
  comboResetTimer = setTimeout(() => { combo = 0; }, 2500);
  setTimeout(() => {
    first.active = false;
    tile.active = false;
    locked = false;
    render();
    if (!tiles.some(item => item.active)) complete();
  }, reduceMotion.matches ? 40 : 500);
}

function effectTier(value) {
  if (value >= 5) return 4;
  if (value >= 3) return 3;
  if (value >= 2) return 2;
  return 1;
}

function addEffect(className, life = 900) {
  while (effectLayer.children.length >= MAX_EFFECTS) effectLayer.firstElementChild.remove();
  const element = document.createElement('i');
  element.className = className;
  effectLayer.append(element);
  setTimeout(() => element.remove(), life);
  return element;
}

function relativeCenter(element) {
  const boardRect = board.getBoundingClientRect();
  const rect = element.getBoundingClientRect();
  return { x: (rect.left + rect.right) / 2 - boardRect.left, y: (rect.top + rect.bottom) / 2 - boardRect.top };
}

function showMatchEffects(pair, gain, value) {
  const tier = effectTier(value);
  const hue = tier === 3 ? 155 : tier === 4 ? 48 : 43;
  const [a, b] = pair.map(relativeCenter);
  const center = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  const angle = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;

  const link = addEffect('match-link');
  link.style.left = `${a.x}px`;
  link.style.top = `${a.y}px`;
  link.style.width = `${distance}px`;
  link.style.setProperty('--angle', `${angle}deg`);

  const ring = addEffect('match-ring');
  ring.style.left = `${center.x}px`;
  ring.style.top = `${center.y}px`;
  ring.style.setProperty('--effect-hue', hue);
  ring.style.setProperty('--ring-size', `${62 + tier * 7}px`);
  ring.style.setProperty('--ring-width', `${3 + tier}px`);
  ring.style.setProperty('--ring-scale', 1.75 + tier * .18);

  const points = addEffect('match-points');
  points.textContent = `+${gain}`;
  points.style.left = `${center.x}px`;
  points.style.top = `${center.y}px`;
  points.style.setProperty('--points-size', `${1.02 + tier * .13}rem`);

  const sparkCount = reduceMotion.matches ? 0 : 8 + tier * 3;
  for (let index = 0; index < sparkCount; index++) {
    const spark = addEffect('match-spark');
    spark.style.left = `${center.x}px`;
    spark.style.top = `${center.y}px`;
    spark.style.setProperty('--a', `${index * 360 / sparkCount + Math.random() * 8}deg`);
    spark.style.setProperty('--d', `${38 + tier * 8 + Math.random() * 24}px`);
    spark.style.setProperty('--effect-hue', hue);
    spark.style.setProperty('--spark-size', `${4 + Math.random() * 3 + tier * .35}px`);
  }
}

function revealWave(element) {
  if (!element?.isConnected || reduceMotion.matches) return;
  const center = relativeCenter(element);
  const wave = addEffect('reveal-wave', 600);
  wave.style.left = `${center.x}px`;
  wave.style.top = `${center.y}px`;
}

function showCombo(value) {
  if (value < 2) return;
  const comboLabel = document.querySelector('#combo');
  comboLabel.classList.remove('show');
  void comboLabel.offsetWidth;
  comboLabel.dataset.tier = effectTier(value);
  comboLabel.innerHTML = `<strong>${value} COMBO</strong><small>連続ペア</small>`;
  comboLabel.classList.add('show');
}

function hint() {
  if (locked) return;
  const available = activeTiles().filter(tile => free(tile));
  for (let i = 0; i < available.length; i++) {
    const pair = available.slice(i + 1).find(tile => tile.face === available[i].face);
    if (pair) {
      [available[i], pair].forEach(tile => board.querySelector(`[data-id="${tile.id}"]`)?.classList.add('hint'));
      setMessage(`${available[i].face}のペアを光らせました`, 'success');
      playSound('reveal');
      return;
    }
  }
  setMessage('取れるペアがありません。シャッフルしてください', 'notice');
  playSound('invalid');
}

function undo() {
  if (locked) return;
  const previous = history.pop();
  if (!previous) return;
  previous.ids.forEach(id => { tiles.find(tile => tile.id === id).active = true; });
  score = previous.score;
  combo = previous.combo;
  lastMatch = previous.lastMatch;
  selected = null;
  setMessage('直前のペアを戻しました');
  playSound('undo');
  render();
}

function reshuffle() {
  if (locked) return;
  const remaining = activeTiles();
  if (!assign(remaining)) return;
  selected = null;
  combo = 0;
  remaining.forEach(tile => { tile.revealed = free(tile); });
  render();
  board.classList.remove('shuffling');
  void board.offsetWidth;
  board.classList.add('shuffling');
  setTimeout(() => board.classList.remove('shuffling'), 650);
  setMessage('図柄を並べ替えました');
  playSound('shuffle');
}

function requestRestart() {
  if (locked) return;
  if (started || activeTiles().length < totalTiles) {
    restartDialog.hidden = false;
    document.querySelector('#restart-confirm').focus();
  } else {
    newGame();
  }
}

function makeConfetti() {
  if (reduceMotion.matches) return;
  const colors = ['#f7d774', '#fff4bd', '#73d3a3', '#de765e', '#81b8df'];
  for (let index = 0; index < 34; index++) {
    const piece = document.createElement('i');
    const angle = Math.random() * Math.PI * 2;
    const distance = 110 + Math.random() * 210;
    piece.style.setProperty('--c', colors[index % colors.length]);
    piece.style.setProperty('--dx', `${Math.cos(angle) * distance}px`);
    piece.style.setProperty('--dy', `${Math.sin(angle) * distance + 90}px`);
    piece.style.setProperty('--spin', `${540 + Math.random() * 720}deg`);
    piece.style.setProperty('--w', `${5 + Math.random() * 6}px`);
    piece.style.setProperty('--h', `${9 + Math.random() * 12}px`);
    confetti.append(piece);
    setTimeout(() => piece.remove(), 1500);
  }
}

function complete() {
  clearInterval(timer);
  clearTimeout(comboResetTimer);
  locked = true;
  makeConfetti();
  playSound('clear');
  vibrate([28, 45, 28]);
  document.querySelector('#result').textContent = `${Math.floor(seconds / 60)}分${seconds % 60}秒・${score.toLocaleString('ja-JP')}点`;
  setMessage('すべての牌を取り除きました！', 'success');
  setTimeout(() => {
    clearDialog.hidden = false;
    document.querySelector('#again').focus();
  }, reduceMotion.matches ? 40 : 620);
}

difficulty.onchange = () => {
  level = difficulty.value;
  localStorage.setItem('mahjong-level', level);
  newGame();
};

soundButton.onclick = () => {
  feedbackOn = !feedbackOn;
  localStorage.setItem('mahjong-feedback', feedbackOn ? 'on' : 'off');
  updateSoundButton();
  if (feedbackOn) playSound('select');
};

document.querySelector('#hint').onclick = hint;
document.querySelector('#undo').onclick = undo;
document.querySelector('#shuffle').onclick = reshuffle;
document.querySelector('#restart').onclick = requestRestart;
document.querySelector('#restart-cancel').onclick = () => { restartDialog.hidden = true; document.querySelector('#restart').focus(); };
document.querySelector('#restart-confirm').onclick = newGame;
document.querySelector('#again').onclick = newGame;
window.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !restartDialog.hidden) {
    restartDialog.hidden = true;
    document.querySelector('#restart').focus();
  }
});

updateSoundButton();
newGame();
