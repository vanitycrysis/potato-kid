import type { SettingsStore } from '../save/settings';
import { el, icon } from './dom';
import type { Sheets } from './sheet';

// The Settings sheet (docs/GUI_MVP.md §11, Codex's design, D-036). Choices apply and are
// stored at once; every way of closing keeps them. There is no audio yet, so nothing plays.

export function openSettings(sheets: Sheets, store: SettingsStore, launcher: HTMLElement | null, scrollTop = 0): void {
  const s = sheets.open({ key: 'settings', icon: 'icon_settings', title: 'Settings', requestedHeight: 480 }, launcher);
  s.setSubtitle('Make the garden your own.');

  // Audio On/Off: a two-choice radio group (one tab stop; arrows move and select).
  const audioIcon = el('span', 'settings-audio-icon');
  const choice = (on: boolean) => {
    const b = el('button', 'ui-button settings-choice', on ? 'On' : 'Off');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.addEventListener('click', () => setAudio(on));
    b.addEventListener('keydown', (e) => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
      e.preventDefault();
      const next = e.key === 'Home' ? true : e.key === 'End' ? false : !on;
      (next ? onButton : offButton).focus();
      setAudio(next);
    });
    return b;
  };
  const onButton = choice(true);
  const offButton = choice(false);
  const toggle = el('div', 'settings-toggle', onButton, offButton);
  toggle.setAttribute('role', 'radiogroup');
  toggle.setAttribute('aria-label', 'Audio');
  const audioRow = el('div', 'settings-row', audioIcon, el('span', 'settings-label', 'Audio'), toggle);

  const slider = (key: 'music' | 'sfx', label: string) => {
    const value = el('span', 'settings-value');
    const input = el('input', 'settings-slider');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.id = `settings-${key}`;
    const name = el('label', 'settings-slider-label', label);
    name.htmlFor = input.id;
    const show = () => {
      const v = store.value[key];
      input.value = String(v);
      value.textContent = `${v}%`;
      input.setAttribute('aria-valuetext', `${v}%`);
      input.style.setProperty('--fill', String(v / 100));
    };
    input.addEventListener('input', () => {
      store.set({ [key]: Number(input.value) });
      show();
    });
    const section = el('div', 'settings-section', el('div', 'settings-slider-head', name, value), input);
    return { section, input, show };
  };
  const music = slider('music', 'Music');
  const sfx = slider('sfx', 'Sound effects');

  const render = () => {
    const on = store.value.audio;
    audioIcon.replaceChildren(icon(on ? 'icon_audio_on' : 'icon_audio_off', '', 'ui-icon-28'));
    for (const [b, mine] of [
      [onButton, true],
      [offButton, false],
    ] as const) {
      const selected = on === mine;
      b.setAttribute('aria-checked', String(selected));
      b.classList.toggle('is-selected', selected);
      b.tabIndex = selected ? 0 : -1;
    }
    // Off disables the sliders; their values stay where they were (GUI_MVP §11).
    for (const x of [music, sfx]) {
      x.input.disabled = !on;
      x.section.classList.toggle('is-off', !on);
      x.show();
    }
  };
  const setAudio = (on: boolean) => {
    if (store.value.audio === on) return;
    store.set({ audio: on });
    render();
  };

  s.body.append(audioRow, el('p', 'sheet-helper', 'Audio is coming soon.'), music.section, sfx.section);
  const done = el('button', 'ui-button ui-primary sheet-action', el('span', 'action-label', 'Done'));
  done.type = 'button';
  done.addEventListener('click', () => sheets.close());
  s.footer.append(done);
  render();
  s.body.scrollTop = scrollTop;
}
