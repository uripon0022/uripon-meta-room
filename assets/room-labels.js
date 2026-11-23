'use strict';

function createRoomLabels(canvas) {
  const ctx = canvas.getContext('2d');
  const padding = 4;
  const gap = 3;
  let width = 0, height = 0, density = 1;
  let tagCache = new WeakMap();
  let bubbleCache = new WeakMap();

  function resize(nextWidth, nextHeight, nextDensity) {
    if (nextWidth === width && nextHeight === height && nextDensity === density) return;
    width = nextWidth;
    height = nextHeight;
    density = nextDensity;
    canvas.width = Math.round(width * density);
    canvas.height = Math.round(height * density);
    ctx.setTransform(canvas.width / width, 0, 0, canvas.height / height, 0, 0);
    tagCache = new WeakMap();
    bubbleCache = new WeakMap();
  }

  function overlaps(a, b) {
    return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x &&
      a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
  }

  function position(anchor, w, h, occupied) {
    const above = anchor.top - h - 5;
    const below = anchor.bottom + 5;
    const side = w / 2 + gap;
    const candidates = [
      [anchor.x - w / 2, above],
      [anchor.x - w - side, above],
      [anchor.x + side, above],
      [anchor.x - w / 2, below],
      [anchor.x - w - side, below],
      [anchor.x + side, below],
      [anchor.x - w / 2, above - h - gap],
    ];
    for (const [left, top] of candidates) {
      const rect = {
        x: Math.min(Math.max(left, padding), width - w - padding),
        y: Math.min(Math.max(top, padding), height - h - padding),
        w, h,
      };
      if (!occupied.some(other => overlaps(rect, other))) {
        occupied.push(rect);
        return rect;
      }
    }
    return null;
  }

  function ellipsis(text, maxWidth) {
    const chars = Array.from(text);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
    return chars.join('') + '…';
  }

  function getTag(player, icon, font, maxWidth) {
    const source = icon + player.name;
    const cached = tagCache.get(player);
    if (cached?.source === source && cached.font === font) return cached;
    ctx.font = font;
    const text = ctx.measureText(source).width <= maxWidth ? source : ellipsis(source, maxWidth);
    const tag = { source, font, text, w: Math.ceil(ctx.measureText(text).width) + 10 };
    tagCache.set(player, tag);
    return tag;
  }

  function getBubble(bubble, font, maxWidth, maxLines) {
    const cached = bubbleCache.get(bubble);
    if (cached?.font === font) return cached;
    ctx.font = font;
    const lines = [];
    for (const paragraph of bubble.text.split('\n')) {
      let line = '';
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > maxWidth) {
          lines.push(line);
          line = '';
        }
        line += char;
      }
      lines.push(line);
    }
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = ellipsis(lines[maxLines - 1], maxWidth);
    }
    const result = { font, lines, w: Math.ceil(Math.max(0, ...lines.map(line => ctx.measureText(line).width))) + 12 };
    bubbleCache.set(bubble, result);
    return result;
  }

  function fillBox({ x, y, w, h }, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 5);
    ctx.fill();
  }

  function draw({ players, self, bubbles, scale, camX, camY, avatarHeight, frame, now }) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const compact = width < 530;
    const tagHeight = compact ? 15 : 19;
    const tagFont = `bold ${compact ? 10 : 13}px sans-serif`;
    const tagMaxWidth = Math.min(compact ? 106 : 180, width - 2 * padding - 10);
    const bubbleFont = `${compact ? 11 : 14}px sans-serif`;
    const lineHeight = compact ? 14 : 18;
    const bubbleMaxWidth = Math.min(compact ? 170 : 300, width - 2 * padding - 12);
    const occupants = [];

    for (const player of players) {
      const x = (player.x - camX) * scale, bottom = (player.y - camY) * scale;
      if (x < 0 || x > width || bottom < 0 || bottom > height) continue;
      const body = player.sleep ? 15 : player.sit ? avatarHeight - 4 : avatarHeight;
      const top = bottom - body * scale;
      const bubble = bubbles[player.id];
      occupants.push({ player, x, top, bottom, bubble: bubble?.until > now ? bubble : null });
    }
    const occupied = occupants.map(({ x, top, bottom }) => ({
      x: x - 9 * scale, y: top, w: 18 * scale, h: bottom - top,
    }));
    occupants.sort((a, b) => Number(b.player === self) - Number(a.player === self) || a.bottom - b.bottom);
    for (const anchor of occupants) {
      const { player } = anchor;
      const emote = player.emu > now ? player.em : '';
      const icon = player.sleep ? '🛏 ' : player.sit ? '🪑 ' : emote === 'dance' ? (frame % 2 ? '♪ ' : '♫ ') :
        emote === 'ssj' ? '⚡ ' : player.st === 'break' ? '☕ ' : '💻 ';
      const tag = getTag(player, icon, tagFont, tagMaxWidth);
      const rect = position(anchor, tag.w, tagHeight, occupied);
      if (!rect) continue;
      const own = player === self;
      fillBox(rect, own ? 'rgba(248,205,114,.98)' : 'rgba(36,29,48,.9)');
      ctx.fillStyle = own ? '#21192b' : '#fff';
      ctx.font = tagFont;
      ctx.fillText(tag.text, rect.x + rect.w / 2, rect.y + rect.h / 2);
    }

    const speaking = occupants.filter(anchor => anchor.bubble).sort((a, b) => b.bubble.until - a.bubble.until);
    for (const anchor of speaking) {
      const { lines, w } = getBubble(anchor.bubble, bubbleFont, bubbleMaxWidth, compact ? 3 : 4);
      const aboveTag = { ...anchor, top: anchor.top - tagHeight - gap };
      const rect = position(aboveTag, w, lines.length * lineHeight + 8, occupied);
      if (!rect) continue;
      fillBox(rect, 'rgba(255,255,255,.97)');
      ctx.strokeStyle = 'rgba(47,37,59,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const above = rect.y + rect.h <= anchor.top;
      const edgeY = above ? rect.y + rect.h : rect.y;
      const tipX = Math.max(rect.x + 5, Math.min(anchor.x, rect.x + rect.w - 5));
      ctx.beginPath();
      ctx.moveTo(tipX - 3, edgeY);
      ctx.lineTo(tipX + 3, edgeY);
      ctx.lineTo(tipX, edgeY + (above ? 4 : -4));
      ctx.fill();
      ctx.fillStyle = '#241e30';
      ctx.font = bubbleFont;
      lines.forEach((line, index) => {
        ctx.fillText(line, rect.x + rect.w / 2, rect.y + 4 + lineHeight * (index + .5));
      });
    }
  }

  return { resize, draw };
}
