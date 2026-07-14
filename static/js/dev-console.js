const DEV_COMMANDS = {
  help: { help: 'show available commands', options: [] },
  give: {
    help: 'grant a test resource',
    options: ['gold', 'tokens', 'vigor', 'packs', 'hats'],
    actions: { gold: 'gold', tokens: 'tokens', vigor: 'vigor', packs: 'packs', hats: 'hats' },
  },
  seed: {
    help: 'create test data',
    options: ['training', 'run', 'recovery', 'almanac'],
    actions: { training: 'seed', run: 'unguided_run', recovery: 'bad_recovery', almanac: 'almanac_bang' },
  },
  wipe: {
    help: 'remove generated test data',
    options: ['training'],
    actions: { training: 'wipe_dev' },
  },
  clear: { help: 'clear the console', options: [] },
};

const DEV_COMMAND_NAMES = Object.keys(DEV_COMMANDS);

function devConsolePrint(output, text, kind = '') {
  const line = document.createElement('div');
  line.className = `dev-console-line${kind ? ` ${kind}` : ''}`;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function devConsoleHelp(output) {
  DEV_COMMAND_NAMES.forEach(command => {
    const spec = DEV_COMMANDS[command];
    const usage = spec.options.length ? `${command} <thing>` : command;
    devConsolePrint(output, `${usage.padEnd(20)}${spec.help}`);
    if (spec.options.length) devConsolePrint(output, `  options: ${spec.options.join(' | ')}`, 'muted');
  });
}

function devConsoleSuggestions(input, suggestions) {
  const value = input.value.trim();
  const trailingSpace = /\s$/.test(input.value);
  const parts = value ? value.toLowerCase().split(/\s+/) : [];
  if (!parts.length) {
    suggestions.textContent = DEV_COMMAND_NAMES.join('  |  ');
    return;
  }
  const command = parts[0];
  const spec = DEV_COMMANDS[command];
  if (parts.length === 1 && !trailingSpace) {
    if (spec && spec.options.length) {
      suggestions.textContent = `${command}  ${spec.options.join('  |  ')}`;
      return;
    }
    const matches = DEV_COMMAND_NAMES.filter(name => name.startsWith(command));
    suggestions.textContent = matches.join('  |  ');
    if (matches.length === 1 && matches[0] !== command && DEV_COMMANDS[matches[0]].options.length) {
      input.value = `${matches[0]} `;
      suggestions.textContent = `${matches[0]}  ${DEV_COMMANDS[matches[0]].options.join('  |  ')}`;
    }
    return;
  }
  if (!spec || !spec.options.length) {
    suggestions.textContent = '';
    return;
  }
  const partial = trailingSpace ? '' : (parts[1] || '');
  const matches = spec.options.filter(option => option.startsWith(partial));
  if (matches.length === 1 && partial && matches[0] !== partial) input.value = `${command} ${matches[0]} `;
  suggestions.textContent = `${command}  ${matches.join('  |  ')}`;
}

async function applyDevAction(action) {
  await api('/dev', { method: 'POST', body: { action } });
  await refreshState();
  SFX.coin();
}

G.openDevConsole = () => {
  SFX.click();
  const ov = showModal(`
    <div class="win dev-console" role="dialog" aria-label="Dev Console">
      <span class="win-title">Dev Console</span>
      <div class="dev-console-output" id="dev-console-output" role="log" aria-live="polite"></div>
      <div class="dev-console-prompt">
        <span>&gt;</span>
        <input id="dev-console-input" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Console command">
      </div>
      <div class="dev-console-suggestions" id="dev-console-suggestions" aria-live="polite"></div>
      <div class="dev-console-actions">
        <button class="btn small" data-dev-close>CLOSE</button>
      </div>
    </div>`, { backdropClose: false });
  const output = ov.querySelector('#dev-console-output');
  const input = ov.querySelector('#dev-console-input');
  const suggestions = ov.querySelector('#dev-console-suggestions');
  const history = [];
  let historyIndex = 0;

  devConsolePrint(output, 'IRON VALE DEV CONSOLE', 'title');
  devConsolePrint(output, 'type help for commands', 'muted');

  const close = () => {
    ov.remove();
    render();
  };
  ov.onclick = e => { if (e.target === ov) close(); };
  ov.querySelector('[data-dev-close]').addEventListener('click', close);
  input.addEventListener('input', () => { suggestions.textContent = ''; });
  input.addEventListener('keydown', async e => {
    if (e.key === 'Tab') {
      e.preventDefault();
      devConsoleSuggestions(input, suggestions);
      return;
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      if (!history.length) return;
      e.preventDefault();
      historyIndex = Math.max(0, Math.min(history.length, historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
      input.value = historyIndex === history.length ? '' : history[historyIndex];
      suggestions.textContent = '';
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const raw = input.value.trim();
    if (!raw) return;
    history.push(raw);
    historyIndex = history.length;
    input.value = '';
    suggestions.textContent = '';
    devConsolePrint(output, `> ${raw}`, 'command');
    const parts = raw.toLowerCase().split(/\s+/);
    const command = parts[0];
    if (command === 'clear') {
      output.textContent = '';
      return;
    }
    if (command === 'help') {
      devConsoleHelp(output);
      return;
    }
    const spec = DEV_COMMANDS[command];
    const option = parts[1];
    if (!spec) {
      devConsolePrint(output, `unknown command: ${command}`, 'error');
      devConsolePrint(output, 'try help', 'muted');
      return;
    }
    if (!option || !spec.actions?.[option] || parts.length !== 2) {
      devConsolePrint(output, `usage: ${command} ${spec.options.length ? `<${spec.options.join('|')}>` : ''}`.trim(), 'error');
      suggestions.textContent = spec.options.length ? `${command}  ${spec.options.join('  |  ')}` : '';
      return;
    }
    try {
      await applyDevAction(spec.actions[option]);
      devConsolePrint(output, `done: ${command} ${option}`, 'success');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'the dev gate refused that command';
      devConsolePrint(output, message, 'error');
    }
  });
  input.focus();
};
