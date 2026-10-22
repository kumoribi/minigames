/* Phaser presentation only. KingdomEngine remains the sole owner of game rules. */
(function () {
  'use strict';
  const CELL = 56, MAP = 1120, E = window.KingdomEngine;
  const SIZES = Object.fromEntries(Object.entries(E.UNIT_VISUALS).map(([kind,v])=>[kind,v.size]));
  const COLORS = [0xd4ddbf, 0xa2ddff, 0xfff292, 0xffa67f, 0xff8795];
  function renderType() {
    if (location.protocol === 'file:') return Phaser.CANVAS;
    try {
      const probe = document.createElement('canvas'), gl = probe.getContext('webgl');
      if (gl) { gl.getExtension('WEBGL_lose_context')?.loseContext(); return Phaser.WEBGL; }
    } catch (_) { /* Canvas remains available when WebGL is blocked or unavailable. */ }
    return Phaser.CANVAS;
  }
  class KingdomRenderer {
    constructor(canvas, assets, onFrame) {
      this.canvas = canvas;
      this.viewport = canvas.parentElement;
      this.tiles = new Map(); this.units = new Map(); this.flags = new Map();
      this.transients = new Set(); this.pending = []; this.world = null;
      this.ready = new Promise((resolve, reject) => {
        this.game = new Phaser.Game({
          // Supplying an existing canvas requires an explicit renderer in Phaser 3.
          type: renderType(),
          canvas, width: MAP, height: MAP, backgroundColor: '#243e32',
          pixelArt: true, antialias: false, roundPixels: true, banner: false,
          audio: { noAudio: true },
          input: { keyboard: false, mouse: false, touch: false, gamepad: false },
          scale: { mode: Phaser.Scale.NONE, autoRound: false },
          fps: { target: 60, smoothStep: true },
          scene: {
            create: () => {
              try {
                const scene = this.game.scene.scenes[0]; this.scene = scene;
                canvas.dataset.renderer = `Phaser ${Phaser.VERSION} / ${this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas'}`;
                for (const [key, asset] of Object.entries(assets)) scene.textures.addImage(key, asset);
                // Generated textures, not additional art downloads.
                const texture = scene.make.graphics({ x: 0, y: 0, add: false });
                texture.fillStyle(0xffffff).fillCircle(4, 4, 4).generateTexture('ks-spark', 8, 8);
                texture.clear().fillStyle(0xb49b62).fillRect(0, 0, 32, 32).generateTexture('ks-missing', 32, 32);
                texture.destroy();
                const grid = scene.add.graphics().setDepth(0);
                for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) {
                  grid.fillStyle((x + y) % 2 ? 0x243e32 : 0x294638).fillRect(x * CELL, y * CELL, CELL, CELL);
                  grid.lineStyle(1, 0x123221, .5).strokeRect(x * CELL, y * CELL, CELL, CELL);
                  grid.fillStyle(0x557c5d, .7).fillCircle(x * CELL + 28, y * CELL + 30, 1);
                }
                this.overlay = scene.add.graphics().setDepth(100);
                this.rally = scene.add.text(0, 0, '⚑', { fontSize: '17px', color: '#82c8ff' }).setDepth(9100);
                this.emitters = {};
                for (const [key, tint] of Object.entries({ gold: 0xffda81, dust: 0xc8b184, fire: 0xff8e45, leaf: 0xb7ec8d })) {
                  this.emitters[key] = scene.add.particles(0, 0, 'ks-spark', {
                    emitting: false, maxParticles: 96, lifespan: { min: 230, max: 650 },
                    speed: { min: 20, max: 85 }, angle: { min: 0, max: 360 },
                    scale: { start: .65, end: 0 }, alpha: { start: .9, end: 0 },
                    gravityY: key === 'dust' ? 40 : -8, tint
                  }).setDepth(7000);
                }
                resolve(this);
              } catch (error) { reject(error); }
            },
            update: () => { if (this.scene) onFrame(performance.now()); }
          }
        });
      });
    }
    image(key, x, y, width, height, depth = 1) {
      const texture = this.scene.textures.exists(key) ? key : 'ks-missing';
      const sprite = this.scene.add.image(x + width / 2, y + height, texture).setOrigin(.5, 1).setDepth(depth);
      const scale = Math.min(width / sprite.width, height / sprite.height);
      sprite.setScale(scale); sprite.baseScale = scale; return sprite;
    }
    own(object, duration = 600, props = {}) {
      while (this.transients.size >= 60) this.remove(this.transients.values().next().value);
      this.transients.add(object);
      this.scene.tweens.add({ targets: object, duration, alpha: 0, ...props, onComplete: () => this.remove(object) });
      return object;
    }
    remove(object) {
      this.scene.tweens.killTweensOf(object); this.transients.delete(object); object.destroy();
    }
    reset(world) {
      this.scene.tweens.killAll();
      for (const view of this.tiles.values()) view.objects.forEach(o => o.destroy());
      for (const view of this.units.values()) view.container.destroy();
      for (const object of this.flags.values()) object.destroy();
      for (const object of this.transients) object.destroy();
      for (const emitter of Object.values(this.emitters)) emitter.killAll();
      this.tiles.clear(); this.units.clear(); this.flags.clear(); this.transients.clear();
      this.pending = []; this.world = world; this.lastReduced = false;
    }
    visible(x, y) {
      const zoom = this.canvas.getBoundingClientRect().width / MAP;
      return x * zoom > this.viewport.scrollLeft - 110 && x * zoom < this.viewport.scrollLeft + this.viewport.clientWidth + 110 &&
        y * zoom > this.viewport.scrollTop - 110 && y * zoom < this.viewport.scrollTop + this.viewport.clientHeight + 110;
    }
    playEffect(effect) { if (this.pending.length < 60) this.pending.push({ ...effect }); }
    setZoom(zoom) { this.game.scale.setZoom(zoom); }
    sync(world, options) {
      if (!this.scene) return;
      if (this.world !== world) this.reset(world);
      const scene = this.scene, quiet = options.reduced;
      if (quiet && !this.lastReduced) {
        scene.tweens.killAll();
        for (const object of [...this.transients]) this.remove(object);
        for (const emitter of Object.values(this.emitters)) emitter.killAll();
        for (const view of this.tiles.values()) if (view.building) view.building.setScale(view.building.baseScale);
        for (const view of this.units.values()) { view.pose.kick = 0; view.sprite.clearTint(); }
      }
      this.lastReduced = quiet;
      for (const tile of world.tiles) {
        let flag = this.flags.get(tile.id);
        if (!tile.revealed && tile.flag && !flag) {
          flag = scene.add.text(tile.x * CELL + 28, tile.y * CELL + 15, '⚑', { fontSize: '29px', color: '#ffc166' }).setOrigin(.5, 0).setDepth(30);
          this.flags.set(tile.id, flag);
        } else if ((tile.revealed || !tile.flag) && flag) { flag.destroy(); this.flags.delete(tile.id); }
        if (!tile.revealed) continue;
        const key = `${tile.terrain}:${tile.building?.kind || ''}`;
        if (this.tiles.get(tile.id)?.key === key) continue;
        if (this.tiles.has(tile.id)) this.tiles.get(tile.id).objects.forEach(o => o.destroy());
        const x = tile.x * CELL, y = tile.y * CELL, objects = [];
        objects.push(this.image('grass', x, y, CELL, CELL));
        if (tile.terrain !== 'grass') objects.push(this.image(tile.terrain, x + 2, y + 2, CELL - 4, CELL - 4, 2));
        let building = null;
        if (tile.building) { building = this.image(tile.building.kind, x + 1, y, CELL - 2, CELL, 3); objects.push(building); }
        objects.push(scene.add.rectangle(x, y, CELL, CELL).setOrigin(0).setFillStyle(0, 0).setStrokeStyle(1, 0x123221, .5).setDepth(4));
        // Clues always sit above units and VFX, including large Dragons.
        objects.push(scene.add.rectangle(x + 3, y + 3, 20, 20, 0x0c251d, .95).setOrigin(0).setDepth(9000));
        objects.push(scene.add.text(x + 13, y + 3, String(tile.clue), {
          fontFamily: 'sans-serif', fontSize: '16px', fontStyle: 'bold', color: '#' + COLORS[Math.min(4, tile.clue)].toString(16)
        }).setOrigin(.5, 0).setDepth(9001));
        this.tiles.set(tile.id, { key, objects, building });
      }
      this.drawOrders(world, options);
      const alive = new Set(), moving = world.phase==='running' && !world.backgroundPaused && !world.result && !document.hidden;
      for (const unit of [...world.units, ...world.enemies]) {
        alive.add(unit.id); let view = this.units.get(unit.id);
        if (!view) {
          const size = SIZES[unit.kind], texture = scene.textures.exists(unit.kind) ? unit.kind : 'ks-missing';
          const sprite = scene.add.image(0, 0, texture).setOrigin(.5, .5);
          const visual=E.UNIT_VISUALS[unit.kind];
          if(texture!=='ks-missing')sprite.setOrigin((visual.bounds[0]+visual.bounds[2])/2/visual.width,(visual.bounds[1]+visual.bounds[3])/2/visual.height);
          const scale = Math.min(size / sprite.width, size / sprite.height); sprite.setScale(scale);
          const shadow = scene.add.ellipse(0, 12, size * .6, 12, 0x071c16, .45);
          const hp = scene.add.graphics(), retreat = scene.add.text(0, -size * .65 - 14, '退避', { fontSize: '12px', color: '#ffd0aa', backgroundColor: '#193326' }).setOrigin(.5, 1).setVisible(false);
          const elite = scene.add.text(0, -size * .65 - 16, '強襲 ×2', {fontSize:'13px',color:'#ffdf9a',backgroundColor:'#631c24'}).setOrigin(.5,1).setVisible(Boolean(unit.empowered));
          const container = scene.add.container(0, 0, [shadow, sprite, hp, retreat, elite]);
          view = { container, sprite, shadow, hp, retreat, size, scale, kind: unit.kind, x: unit.x, y: unit.y, pose: { kick: 0 }, lastHit: -1000 };
          this.units.set(unit.id, view);
        }
        const dx = unit.x - view.x, dy = unit.y - view.y;
        const walking = moving && Math.abs(dx) + Math.abs(dy) > .00001;
        view.x = unit.x; view.y = unit.y;
        view.container.setPosition((unit.x + .5) * CELL, (unit.y + .5) * CELL).setDepth(1000 + unit.y * 10);
        const phase = scene.time.now / 90 + unit.id;
        const bob = !quiet && walking ? -Math.abs(Math.sin(phase)) * (unit.kind === 'dragon' ? 3 : 2.5) : 0;
        view.sprite.setY(bob).setAngle(quiet ? 0 : (walking ? Math.sin(phase) * 3 : 0) + view.pose.kick);
        if (walking && Math.abs(dx) > .0001) view.sprite.setFlipX(dx < 0);
        view.hp.clear();
        if (unit.hp < unit.maxHp || unit.kind === 'dragon' || unit.empowered) {
          const width = unit.kind === 'dragon' ? 64 : unit.kind === 'worker' ? 38 : 44, y = -view.size * .65 - 8;
          view.hp.fillStyle(0x251b16).fillRect(-width / 2, y, width, 5);
          view.hp.fillStyle(unit.kind === 'goblin' || unit.kind === 'dragon' ? 0xfa7265 : 0xa5e28c).fillRect(-width / 2, y, width * Math.max(0, Math.min(1, unit.hp / unit.maxHp)), 5);
        }
        view.retreat.setText(unit.waitingNonSolid?'待避・待機':'退避').setVisible(unit.kind === 'worker' && (Boolean(unit.waitingNonSolid)||world.enemies.some(e => Math.hypot(e.x - unit.x, e.y - unit.y) < 2.2)));
        view.sprite.setAlpha(unit.waitingNonSolid?.55:1);
      }
      for (const [id, view] of this.units) if (!alive.has(id)) {
        if (!quiet && this.visible(view.container.x, view.container.y)) {
          const ghost = scene.add.image(view.container.x, view.container.y, view.sprite.texture.key).setOrigin(view.sprite.originX, view.sprite.originY).setScale(view.scale).setFlipX(view.sprite.flipX).setTint(0x81937b).setDepth(6000);
          this.own(ghost, 380, { y: ghost.y + 7, scaleY: view.scale * .65 });
        }
        scene.tweens.killTweensOf(view.pose); view.container.destroy(); this.units.delete(id);
      }
      for (const effect of this.pending.splice(0)) this.showEffect(effect, quiet);
    }
    drawOrders(world, { selected, buildKind }) {
      const g = this.overlay.clear(), focus = world.tiles[selected], kind = buildKind || focus.building?.kind;
      for(const region of world.regions){
        g.lineStyle(2,0xcba4ff,.8).strokeRect((region.x-1)*CELL+2,(region.y-1)*CELL+2,CELL*3-4,CELL*3-4);
      }
      if(world.armyMode==='defend'){
        const rally=world.tiles[world.rally];
        g.lineStyle(2,0x94e3c1,.8).strokeCircle((rally.x+.5)*CELL,(rally.y+.5)*CELL,world.defenseRadius*CELL);
      }
      if (['farm', 'windmill', 'barracks', 'blacksmith'].includes(kind)) {
        const diagonal = kind === 'farm' || kind === 'windmill', color = diagonal ? 0xeecb58 : 0x81caff;
        for (const id of E.neighbors(selected, diagonal)) {
          const t = world.tiles[id]; g.fillStyle(color, .22).fillRect(t.x * CELL + 2, t.y * CELL + 2, CELL - 4, CELL - 4);
          g.lineStyle(1, color).strokeRect(t.x * CELL + 2, t.y * CELL + 2, CELL - 4, CELL - 4);
          if (t.revealed && t.building?.kind === ({ farm: 'windmill', windmill: 'farm', barracks: 'blacksmith', blacksmith: 'barracks' })[kind] && t.building.hp > 0)
            g.lineStyle(3, color).lineBetween((focus.x + .5) * CELL, (focus.y + .5) * CELL, (t.x + .5) * CELL, (t.y + .5) * CELL);
        }
      } else if (kind === 'tower' || kind === 'keep') g.lineStyle(2, 0x86d2ff, .8).strokeCircle((focus.x + .5) * CELL, (focus.y + .5) * CELL, E.towerRange(world) * CELL);
      for (const task of world.tasks) {
        const t = world.tiles[task.tileId], x = t.x * CELL, y = t.y * CELL;
        if (task.kind === 'build') {
          // Presentation objects stay in renderer state, never on engine tasks.
          const key = `preview-${task.id}`;
          if (!this.flags.has(key)) this.flags.set(key, this.image(task.building, x + 1, y, CELL - 2, CELL, 90).setAlpha(.4));
        }
        const duration = task.kind === 'build' ? E.BUILDINGS[task.building].time : 3;
        g.lineStyle(2, task.workerId ? 0xbdf8f0 : 0x729eae).strokeRect(x + 4, y + 4, CELL - 8, CELL - 8);
        g.fillStyle(0x12271f).fillRect(x + 5, y + CELL - 7, CELL - 10, 4);
        g.fillStyle(task.workerId ? 0xf0d77c : 0x71908d).fillRect(x + 5, y + CELL - 7, (CELL - 10) * Math.max(0, 1 - task.remaining / duration), 4);
        if (task.tileId === selected && task.workerId) {
          const worker = world.units.find(u => u.id === task.workerId);
          const goals = task.kind === 'build' ? [t.id] : E.neighbors(t.id, false).filter(id => world.tiles[id].revealed);
          const route = worker && E.path(world, worker, goals);
          if (route) { let p = worker; for (const id of route) { const next = world.tiles[id]; g.lineStyle(2, 0xbdf8f0, .55).lineBetween((p.x + .5) * CELL, (p.y + .5) * CELL, (next.x + .5) * CELL, (next.y + .5) * CELL); p = next; } }
        }
      }
      const previews = new Set(world.tasks.filter(t => t.kind === 'build').map(t => `preview-${t.id}`));
      for (const [key, sprite] of this.flags) if (typeof key === 'string' && !previews.has(key)) { sprite.destroy(); this.flags.delete(key); }
      g.lineStyle(3, 0xffe8a3).strokeRect(focus.x * CELL + 2, focus.y * CELL + 2, CELL - 4, CELL - 4);
      const rally = world.tiles[world.rally]; this.rally.setPosition(rally.x * CELL + 35, rally.y * CELL + 31);
    }
    showEffect(effect, quiet) {
      const x = (effect.x + .5) * CELL, y = (effect.y + .5) * CELL, scene = this.scene;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !this.visible(x, y)) return;
      const burst = (kind, count) => { if (!quiet) this.emitters[kind].explode(count, x, y); };
      if (effect.kind === 'hit') {
        const fromX = (effect.fromX + .5) * CELL, fromY = (effect.fromY + .5) * CELL;
        const color = effect.source === 'dragon' ? 0xff8e45 : effect.source === 'goblin' ? 0xef9981 : 0xffe69e;
        const victims = this.units.has(effect.targetId) ? [this.units.get(effect.targetId)] : [];
        if (!quiet) for (const victim of victims) if (scene.time.now - victim.lastHit > 600) {
          victim.lastHit = scene.time.now; victim.sprite.setTint(0xe8c6a4);
          scene.time.delayedCall(140, () => { if (victim.sprite.active) victim.sprite.clearTint(); });
        }
        const attacker = this.units.get(effect.sourceId);
        if (attacker?.kind === effect.source && !quiet) {
          scene.tweens.killTweensOf(attacker.pose); attacker.pose.kick = effect.source === 'dragon' ? -7 : -12;
          scene.tweens.add({ targets: attacker.pose, kick: 0, duration: 260, ease: 'Back.Out' });
        }
        if (!quiet && (effect.source === 'tower' || effect.source === 'keep' || effect.source === 'dragon')) {
          const projectile = scene.add.image(fromX, fromY, 'ks-spark').setTint(color).setScale(effect.source === 'dragon' ? 1.7 : .7).setDepth(6500);
          this.own(projectile, 170, { x, y, alpha: .2, ease: 'Quad.In' });
        }
        const slash = scene.add.graphics().setPosition(x, y).setDepth(6501).lineStyle(effect.source === 'dragon' ? 5 : 3, color, .85);
        if (quiet) slash.strokeCircle(0, 0, 13);
        else slash.beginPath().arc(0, 0, effect.source === 'dragon' ? 29 : 20, -2.6, .3).strokePath();
        this.own(slash, quiet ? 160 : 280, quiet ? {} : { angle: 32 });
        burst(effect.source === 'dragon' ? 'fire' : 'gold', effect.source === 'dragon' ? 12 : 5);
      } else if (effect.kind === 'build') {
        const tile = this.world.tiles[E.index(effect.x, effect.y)], sprite = this.tiles.get(tile.id)?.building;
        if (sprite && !quiet) { sprite.setScale(sprite.baseScale * .88); scene.tweens.add({ targets: sprite, scaleX: sprite.baseScale, scaleY: sprite.baseScale, duration: 420, ease: 'Back.Out' }); }
        burst('dust', 14); this.label(x, y - 28, '建築完成', '#ffe69e', quiet);
      } else if (effect.kind === 'reveal') {
        const fog = scene.add.rectangle(x, y, CELL, CELL, 0x294638, .9).setDepth(500);
        this.own(fog, quiet ? 100 : 420); burst('leaf', 9);
      } else if (effect.kind === 'gather') {
        this.label(x, y - 25, { wood: '木材', food: '食料', gold: '金' }[effect.resource] + ' 採集', '#e5e9b4', quiet);
      } else if (effect.kind === 'victory') {
        burst('gold', 60); this.label(x, y - 35, '⚑ 王国に平和が戻った！', '#ffe69e', quiet, 1100);
      }
    }
    label(x, y, text, color, quiet, duration = 650) {
      const label = this.scene.add.text(x, y, text, { fontFamily: 'sans-serif', fontSize: '12px', fontStyle: 'bold', color, stroke: '#183025', strokeThickness: 3 }).setOrigin(.5).setDepth(8000);
      this.own(label, duration, quiet ? {} : { y: y - 15, ease: 'Sine.Out' });
    }
  }
  window.KingdomRenderer = KingdomRenderer;
})();
