'use strict';

function readChatMentions(text, data) {
  const mentions = [];
  if (!data || typeof data !== 'object') return mentions;
  let previousEnd = 0;
  for (const [offset, mention] of Object.entries(data)) {
    if (!/^(0|[1-9][0-9]{0,2})$/.test(offset)) continue;
    const start = Number(offset);
    const { pid, n: name } = mention || {};
    if (typeof pid !== 'string' || !pid || typeof name !== 'string' || !name) continue;
    const label = '@' + name;
    const end = start + label.length;
    if (start < previousEnd || !text.startsWith(label, start)) continue;
    if (end < text.length && !/[\s、。！？!?,.）)」』：:]/.test(text[end])) continue;
    mentions.push({ start, end, pid, name });
    previousEnd = end;
  }
  return mentions;
}

function createChatMentionComposer({ input, list, button, getCandidates }) {
  let previousValue = input.value;
  let mentions = [];
  let beforeInput = null;
  let options = [];
  let active = -1;
  let query = null;
  let composing = false;

  function close() {
    query = null;
    options = [];
    active = -1;
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function applyEdit(start, end, replacementLength) {
    const shift = replacementLength - (end - start);
    mentions = mentions.flatMap(mention => {
      if (mention.end <= start) return [mention];
      if (mention.start >= end) return [{ ...mention, start: mention.start + shift, end: mention.end + shift }];
      return [];
    });
  }

  function trackInput() {
    const value = input.value;
    if (value !== previousValue) {
      let start = 0;
      let oldEnd = previousValue.length;
      let newEnd = value.length;
      const startLimit = Math.min(beforeInput?.start ?? oldEnd, newEnd);
      const endLimit = beforeInput?.end ?? 0;
      while (start < startLimit && previousValue[start] === value[start]) start++;
      while (oldEnd > Math.max(start, endLimit) && newEnd > start &&
             previousValue[oldEnd - 1] === value[newEnd - 1]) {
        oldEnd--;
        newEnd--;
      }
      applyEdit(start, oldEnd, newEnd - start);
      previousValue = value;
    }
    beforeInput = null;
  }

  function highlight(index, scroll = false) {
    active = index;
    for (const [position, option] of Array.from(list.children).entries()) {
      option.setAttribute('aria-selected', String(position === active));
    }
    const selected = list.children[active];
    if (selected) {
      input.setAttribute('aria-activedescendant', selected.id);
      if (scroll) selected.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  }

  function refresh() {
    if (composing || document.activeElement !== input || input.selectionStart !== input.selectionEnd) {
      close();
      return;
    }
    const end = input.selectionStart;
    const match = /(?:^|[\s（(「『、。])[@＠]([^@＠]{0,16})$/.exec(input.value.slice(0, end));
    const start = match ? end - match[1].length - 1 : -1;
    if (!match || mentions.some(mention => mention.start === start)) {
      close();
      return;
    }
    const needle = match[1].trim().normalize('NFKC').toLocaleLowerCase('ja');
    const results = getCandidates().filter(({ name }) => name.normalize('NFKC').toLocaleLowerCase('ja').includes(needle));
    query = { start, end };
    const keep = options[active]?.id;
    options = results;
    list.replaceChildren();
    for (const [index, candidate] of results.entries()) {
      const option = document.createElement('div');
      option.id = 'chat-mention-option-' + index;
      option.className = 'chat-mention-option';
      option.setAttribute('role', 'option');
      option.dataset.index = index;
      option.textContent = candidate.name;
      if (candidate.hint) {
        const hint = document.createElement('small');
        hint.textContent = candidate.hint;
        option.appendChild(hint);
      }
      list.appendChild(option);
    }
    if (!results.length) {
      const empty = document.createElement('div');
      empty.className = 'chat-mention-empty';
      empty.setAttribute('role', 'status');
      empty.textContent = needle ? '一致する人がいません' : '呼べる在室者がいません';
      list.appendChild(empty);
    }
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    const selectedIndex = results.findIndex(candidate => candidate.id === keep);
    highlight(results.length ? Math.max(0, selectedIndex) : -1);
  }

  function replace(start, end, text) {
    if (input.value.length - (end - start) + text.length > input.maxLength) return false;
    applyEdit(start, end, text.length);
    input.setRangeText(text, start, end, 'end');
    previousValue = input.value;
    return true;
  }

  function choose(index) {
    const candidate = options[index];
    if (!candidate || !query) return;
    const current = getCandidates().find(player => player.id === candidate.id);
    if (!current) { refresh(); return; }
    const { start, end } = query;
    const label = '@' + current.name;
    if (!replace(start, end, label + ' ') && !replace(start, end, label)) return;
    mentions.push({ start, end: start + label.length, pid: current.id, name: current.name });
    close();
    input.focus();
  }

  input.addEventListener('beforeinput', () => {
    beforeInput = { start: input.selectionStart, end: input.selectionEnd };
  });
  input.addEventListener('input', () => { trackInput(); refresh(); });
  input.addEventListener('compositionstart', () => { composing = true; close(); });
  input.addEventListener('compositionend', () => { composing = false; refresh(); });
  input.addEventListener('click', refresh);
  input.addEventListener('blur', close);
  input.addEventListener('keyup', event => {
    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) refresh();
  });
  list.addEventListener('pointerdown', event => {
    if (event.target.closest('[role="option"]')) event.preventDefault();
  });
  list.addEventListener('click', event => {
    const option = event.target.closest('[role="option"]');
    if (option) choose(Number(option.dataset.index));
  });
  button.addEventListener('click', () => {
    input.focus();
    refresh();
    if (query) return;
    const start = input.selectionStart;
    const end = input.selectionEnd;
    const marker = start > 0 && !/\s/.test(input.value[start - 1]) ? ' @' : '@';
    if (replace(start, end, marker)) refresh();
  });

  return {
    handleKey(event) {
      if (!query || composing || event.isComposing || event.keyCode === 229) return false;
      if (event.key === 'Escape') { close(); return true; }
      if (!options.length) return false;
      if (event.key === 'Enter') { choose(active); return true; }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return false;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      highlight((active + step + options.length) % options.length, true);
      return true;
    },
    payload() {
      const leadingSpaces = input.value.length - input.value.trimStart().length;
      const data = Object.fromEntries(mentions
        .map(({ start, pid, name }) => [start - leadingSpaces, { pid, n: name }]));
      const valid = readChatMentions(input.value.trim(), data);
      return valid.length ? Object.fromEntries(valid
        .map(({ start, pid, name }) => [start, { pid, n: name }])) : null;
    },
    reset() {
      previousValue = input.value;
      mentions = [];
      beforeInput = null;
      close();
    },
  };
}
