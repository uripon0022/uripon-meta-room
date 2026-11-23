'use strict';

function createRoomLabels(canvas) {
  const ctx = canvas.getContext('2d');
  const padding = 4;
  const gap = 3;
  const revealGap = 7;
  let width = 0, height = 0, density = 1;
  let tagCache = new WeakMap();
  let bubbleCache = new WeakMap();
  let tagPositions = new WeakMap();
  let visibleBubbles = new WeakSet();

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
    tagPositions = new WeakMap();
  }

  function fixedBox(anchor, w, h, offset = 0) {
    return {
      x: Math.min(Math.max(anchor.x - w / 2, padding), width - w - padding),
      y: Math.min(Math.max(anchor.top - h - 5 - offset, padding), height - h - padding),
      w, h,
    };
  }

  function overlaps(rect, box, space) {
    return rect.x < box.x + box.w + space && rect.x + rect.w + space > box.x &&
      rect.y < box.y + box.h + space && rect.y + rect.h + space > box.y;
  }

  function reserve(rect, occupied, space) {
    if (occupied.some(box => overlaps(rect, box, space))) return false;
    occupied.push(rect);
    return true;
  }

  function placeTag(anchor, occupants, occupied, now) {
    const { player, preferred } = anchor;
    const previous = tagPositions.get(player);
    const shifted = previous && (previous.dx !== 0 || previous.dy !== 0);
    // 近くを通り過ぎるだけで札が往復しないよう、十分離れてから頭上に戻す。
    const alone = shifted && occupants.every(other =>
      other === anchor || !overlaps(preferred, other.preferred, 12));
    const clearSince = alone ? previous.clearSince ?? now : null;
    function at(x, y) {
      const box = { ...preferred, x, y };
      if (x < padding || x + box.w > width - padding ||
          y < padding || y + box.h > height - padding ||
          !reserve(box, occupied, gap)) return null;
      tagPositions.set(player, { dx: x - preferred.x, dy: y - preferred.y, clearSince });
      return box;
    }

    if (shifted && (clearSince === null || now - clearSince < 750)) {
      const lastBox = at(preferred.x + previous.dx, preferred.y + previous.dy);
      if (lastBox) return lastBox;
    }
    const centered = at(preferred.x, preferred.y);
    if (centered) return centered;
    const step = preferred.h + gap;
    for (let y = preferred.y - step; y >= padding; y -= step) {
      const stacked = at(preferred.x, y);
      if (stacked) return stacked;
    }
    for (let y = anchor.bottom + 5; y + preferred.h <= height - padding; y += step) {
      const stacked = at(preferred.x, y);
      if (stacked) return stacked;
    }

    // 縦一列に乗り切れないときは、収まる空き位置のうち頭上に近い順に試す。
    const xs = [padding, ...occupied.map(box => box.x + box.w + gap)]
      .sort((a, b) => Math.abs(a - preferred.x) - Math.abs(b - preferred.x));
    const ys = [padding, ...occupied.map(box => box.y + box.h + gap)]
      .sort((a, b) => Math.abs(a - preferred.y) - Math.abs(b - preferred.y));
    for (const x of xs) {
      for (const y of ys) {
        const placed = at(x, y);
        if (placed) return placed;
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
    if (cached?.source === source && cached.font === font && cached.maxWidth === maxWidth) return cached;
    ctx.font = font;
    const text = ctx.measureText(source).width <= maxWidth ? source : ellipsis(source, maxWidth);
    const tag = { source, font, maxWidth, text, w: Math.ceil(ctx.measureText(text).width) + 10 };
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

  function draw({ players, self, bubbles, scale, camX, camY, avatarHeight, now }) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const compact = width < 530;
    const tagHeight = compact ? 15 : 19;
    const tagFont = `bold ${compact ? 10 : 13}px sans-serif`;
    const rows = Math.max(1, Math.floor((height - 2 * padding + gap) / (tagHeight + gap)));
    const columns = Math.max(1, Math.ceil(players.length / rows));
    const columnWidth = Math.floor((width - 2 * padding + gap) / columns);
    const tagMaxWidth = Math.min(compact ? 106 : 180, columnWidth - gap - 10);
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
      const emote = player.emu > now ? player.em : '';
      const icon = player.sleep ? '🛏 ' : player.sit ? '🪑 ' : emote === 'dance' ? '💃 ' :
        emote === 'ssj' ? '⚡ ' : player.st === 'break' ? '☕ ' : '💻 ';
      const tag = getTag(player, icon, tagFont, tagMaxWidth);
      occupants.push({ player, x, top, bottom, tag, preferred: fixedBox({ x, top }, tag.w, tagHeight),
        bubble: bubble?.until > now ? bubble : null });
    }

    // 自分と停止中のアバターを先に置き、横切る側に空き位置を割り当てる。
    occupants.sort((a, b) => Number(b.player === self) - Number(a.player === self) ||
      Number(!!a.player.moving) - Number(!!b.player.moving) || a.player.id.localeCompare(b.player.id));
    const occupied = [];
    for (const anchor of occupants) {
      anchor.tagBox = placeTag(anchor, occupants, occupied, now);
      if (!anchor.tagBox) {
        // 大人数が同じ場所に集まっても、全員の札が収まるように列を分ける。
        occupied.length = 0;
        occupants.forEach((item, index) => {
          const x = padding + Math.floor(index / rows) * columnWidth + (columnWidth - gap - item.tag.w) / 2;
          const y = padding + (index % rows) * (tagHeight + gap);
          item.tagBox = { ...item.preferred, x, y };
          tagPositions.set(item.player, { dx: x - item.preferred.x, dy: y - item.preferred.y, clearSince: null });
          occupied.push(item.tagBox);
        });
        break;
      }
    }

    ctx.beginPath();
    for (const { x, top, preferred, tagBox } of occupants) {
      if (Math.abs(preferred.x - tagBox.x) < 5 && Math.abs(preferred.y - tagBox.y) < 5) continue;
      ctx.moveTo(tagBox.x + tagBox.w / 2, tagBox.y > top ? tagBox.y : tagBox.y + tagBox.h);
      ctx.lineTo(x, top);
    }
    ctx.strokeStyle = 'rgba(53,41,66,.50)';
    ctx.lineWidth = 1;
    ctx.stroke();
    for (const { player, tag, tagBox } of occupants) {
      const own = player === self;
      fillBox(tagBox, own ? 'rgba(248,205,114,.98)' : 'rgba(36,29,48,.9)');
      ctx.fillStyle = own ? '#21192b' : '#fff';
      ctx.font = tagFont;
      ctx.fillText(tag.text, tagBox.x + tagBox.w / 2, tagBox.y + tagBox.h / 2);
    }

    const nextBubbles = new WeakSet();
    const speaking = occupants.filter(anchor => anchor.bubble).sort((a, b) => b.bubble.until - a.bubble.until);
    for (const anchor of speaking) {
      const { lines, w } = getBubble(anchor.bubble, bubbleFont, bubbleMaxWidth, compact ? 3 : 4);
      const center = anchor.tagBox.x + anchor.tagBox.w / 2;
      const rect = fixedBox({ x: center, top: anchor.tagBox.y }, w, lines.length * lineHeight + 8, gap);
      // 表示に戻るときだけ少し広めの余白を取って、境目での点滅を防ぐ。
      if (!reserve(rect, occupied, visibleBubbles.has(anchor.bubble) ? gap : revealGap)) continue;
      nextBubbles.add(anchor.bubble);
      fillBox(rect, 'rgba(255,255,255,.97)');
      ctx.strokeStyle = 'rgba(47,37,59,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const edgeY = rect.y + rect.h;
      const tipX = Math.max(rect.x + 5, Math.min(center, rect.x + rect.w - 5));
      ctx.beginPath();
      ctx.moveTo(tipX - 3, edgeY);
      ctx.lineTo(tipX + 3, edgeY);
      ctx.lineTo(tipX, edgeY + 4);
      ctx.fill();
      ctx.fillStyle = '#241e30';
      ctx.font = bubbleFont;
      lines.forEach((line, index) => {
        ctx.fillText(line, rect.x + rect.w / 2, rect.y + 4 + lineHeight * (index + .5));
      });
    }
    visibleBubbles = nextBubbles;
  }

  return { resize, draw };
}
