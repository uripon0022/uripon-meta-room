'use strict';

function createRoomLabels(canvas) {
  const ctx = canvas.getContext('2d');
  const padding = 4;
  const gap = 3;
  const revealGap = 7;
  let width = 0, height = 0, density = 1;
  let tagCache = new WeakMap();
  let bubbleCache = new WeakMap();
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

  function ellipsis(text, maxWidth) {
    const chars = Array.from(text);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
    return chars.join('') + '…';
  }

  function getTag(player, font, maxWidth) {
    const source = player.name;
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

  function draw({ players, bubbles, scale, camX, camY, avatarHeight, now }) {
    if (!width || !height) return;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const compact = width < 530;
    const tagHeight = compact ? 15 : 19;
    const tagFont = `bold ${compact ? 10 : 13}px sans-serif`;
    const tagMaxWidth = Math.min(compact ? 168 : 218, width - 2 * padding - 10);
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
      const tag = getTag(player, tagFont, tagMaxWidth);
      occupants.push({ tag, tagBox: fixedBox({ x, top }, tag.w, tagHeight),
        bubble: bubble?.until > now ? bubble : null });
    }

    // 重なる名札もそのまま描く。背景を先にまとめて塗り、文字を背景で隠さない。
    const occupied = occupants.map(({ tagBox }) => tagBox);
    ctx.fillStyle = 'rgba(36,29,48,.59)';
    ctx.beginPath();
    for (const { x, y, w, h } of occupied) ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();

    ctx.font = tagFont;
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(22,17,31,.8)';
    for (const { tag, tagBox } of occupants) {
      ctx.strokeText(tag.text, tagBox.x + tagBox.w / 2, tagBox.y + tagBox.h / 2);
    }
    ctx.fillStyle = '#fff';
    for (const { tag, tagBox } of occupants) {
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
