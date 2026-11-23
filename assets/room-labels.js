'use strict';

function createRoomLabels(canvas) {
  const ctx = canvas.getContext('2d');
  const padding = 4;
  const gap = 3;
  const revealGap = 7;
  let width = 0, height = 0, density = 1;
  let tagCache = new WeakMap();
  let bubbleCache = new WeakMap();
  let visibleTags = new WeakSet();
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

  function reserve(rect, occupied, space) {
    const overlaps = occupied.some(box => rect.x < box.x + box.w + space &&
      rect.x + rect.w + space > box.x && rect.y < box.y + box.h + space &&
      rect.y + rect.h + space > box.y);
    if (overlaps) return false;
    occupied.push(rect);
    return true;
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

  function draw({ players, self, bubbles, scale, camX, camY, avatarHeight, now }) {
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
      const emote = player.emu > now ? player.em : '';
      const icon = player.sleep ? '🛏 ' : player.sit ? '🪑 ' : emote === 'dance' ? '💃 ' :
        emote === 'ssj' ? '⚡ ' : player.st === 'break' ? '☕ ' : '💻 ';
      const tag = getTag(player, icon, tagFont, tagMaxWidth);
      occupants.push({ player, x, top, tag, tagBox: fixedBox({ x, top }, tag.w, tagHeight),
        bubble: bubble?.until > now ? bubble : null });
    }

    const occupied = [];
    function drawTag({ tag, tagBox }, own) {
      fillBox(tagBox, own ? 'rgba(248,205,114,.98)' : 'rgba(36,29,48,.9)');
      ctx.fillStyle = own ? '#21192b' : '#fff';
      ctx.font = tagFont;
      ctx.fillText(tag.text, tagBox.x + tagBox.w / 2, tagBox.y + tagBox.h / 2);
    }

    const own = occupants.find(({ player }) => player === self);
    if (own) {
      occupied.push(own.tagBox);
      drawTag(own, true);
    }
    const nextTags = new WeakSet();
    const guests = occupants.filter(anchor => anchor !== own).sort((a, b) =>
      Number(visibleTags.has(b.player)) - Number(visibleTags.has(a.player)) || a.player.id.localeCompare(b.player.id));
    for (const anchor of guests) {
      const { player, tagBox } = anchor;
      if (!reserve(tagBox, occupied, visibleTags.has(player) ? gap : revealGap)) continue;
      nextTags.add(player);
      drawTag(anchor, false);
    }
    visibleTags = nextTags;

    const nextBubbles = new WeakSet();
    // 話者の札が隠れている場面では、別の人の発言に見えないよう吹き出しも出さない。
    const speaking = occupants.filter(anchor => anchor.bubble && (anchor === own || visibleTags.has(anchor.player)))
      .sort((a, b) => b.bubble.until - a.bubble.until);
    for (const anchor of speaking) {
      const { lines, w } = getBubble(anchor.bubble, bubbleFont, bubbleMaxWidth, compact ? 3 : 4);
      const rect = fixedBox(anchor, w, lines.length * lineHeight + 8, tagHeight + revealGap + 1);
      // 表示に戻るときだけ少し広めの余白を取って、境目での点滅を防ぐ。
      if (!reserve(rect, occupied, visibleBubbles.has(anchor.bubble) ? gap : revealGap)) continue;
      nextBubbles.add(anchor.bubble);
      fillBox(rect, 'rgba(255,255,255,.97)');
      ctx.strokeStyle = 'rgba(47,37,59,.28)';
      ctx.lineWidth = 1;
      ctx.stroke();
      const edgeY = rect.y + rect.h;
      const tipX = Math.max(rect.x + 5, Math.min(anchor.x, rect.x + rect.w - 5));
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
