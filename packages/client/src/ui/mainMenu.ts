// Main menu (P8.1, GAME_DESIGN §11): title, fake IT loading messages, wobbly PLAY, a big HONK
// button, the car on the turntable, and a slideshow of company images (assets/menu/).

import { MENU } from '../render/look';
import { t, type StringKey } from '../i18n';

/** Fake IT loading messages (original text; no real products or brands), in the page's language. */
const MESSAGE_KEYS = ['menu.msg1', 'menu.msg2', 'menu.msg3', 'menu.msg4', 'menu.msg5', 'menu.msg6', 'menu.msg7', 'menu.msg8', 'menu.msg9', 'menu.msg10', 'menu.msg11', 'menu.msg12'] as const satisfies readonly StringKey[];
export const loadingMessages = (): string[] => MESSAGE_KEYS.map((k) => t(k));


/** Which of `count` items shows at `now` ms when each stays `periodMs`. Pure, for tests. */
export const cycleIndex = (now: number, periodMs: number, count: number): number =>
  count <= 0 ? 0 : Math.floor(Math.max(now, 0) / periodMs) % count;

/** "office-party_2025.jpg" → "office party 2025" (slideshow caption). */
export const captionOf = (file: string): string => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export interface MainMenuHandlers {
  /** Host a game (P12.1). */
  onHost(): void;
  /** See the games and join one (P12.1). */
  onJoin(): void;
  onHonk(): void;
  onSettings(): void;
  onKeys(): void;
  onLeague(): void;
  /** Touch screens: switch this device to the phone controller (P11.5). */
  onPad(): void;
}

export class MainMenu {
  readonly root = document.createElement('div');
  private readonly loading = document.createElement('p');
  private readonly carName = document.createElement('b');
  private readonly slides = document.createElement('figure');
  private readonly slideImg = document.createElement('img');
  private readonly slideCaption = document.createElement('figcaption');
  private readonly honk = document.createElement('button');
  private images: string[] = [];
  private readonly messages = loadingMessages();
  private shownMessage = -1;
  private shownSlide = -1;

  constructor(parent: HTMLElement, handlers: MainMenuHandlers) {
    this.root.className = 'menu';
    const panel = document.createElement('div');
    panel.className = 'menu-panel';
    const title = document.createElement('h1');
    title.className = 'menu-title';
    title.innerHTML = 'Escape<br /><span>from Work</span>';
    this.loading.className = 'menu-loading';
    // HOST makes a game with your settings, JOIN lists the games to jump into (P12.1).
    const bigButton = (action: string, text: string, extra: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `menu-play wobbly ${extra}`;
      b.dataset.action = action;
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    const main = document.createElement('div');
    main.className = 'menu-main';
    main.append(bigButton('host', t('menu.host'), 'menu-host', () => handlers.onHost()), bigButton('join', t('menu.join'), 'menu-join', () => handlers.onJoin()));
    this.honk.type = 'button';
    this.honk.className = 'menu-honk wobbly';
    this.honk.dataset.action = 'honk';
    this.honk.textContent = t('menu.honk');
    this.honk.addEventListener('click', () => {
      handlers.onHonk();
      this.honk.classList.remove('honked');
      void this.honk.offsetWidth; // restart the squish
      this.honk.classList.add('honked');
    });
    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons';
    buttons.append(main, this.honk);
    const small = document.createElement('div');
    small.className = 'menu-small';
    const smallButton = (action: string, text: string, onClick: () => void): HTMLButtonElement => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'menu-small-button';
      b.dataset.action = action;
      b.textContent = text;
      b.addEventListener('click', onClick);
      return b;
    };
    small.append(
      smallButton('league', t('menu.league'), () => handlers.onLeague()),
      smallButton('settings', t('menu.settings'), () => handlers.onSettings()),
      smallButton('keys', t('menu.keys'), () => handlers.onKeys()),
    );
    // A phone or tablet: offer the controller (big touch buttons) instead of the 3D race.
    if (typeof window.matchMedia === 'function' && window.matchMedia('(any-pointer: coarse)').matches) {
      const pad = smallButton('pad', t('menu.pad'), () => handlers.onPad());
      pad.classList.add('menu-pad');
      small.appendChild(pad);
    }
    const car = document.createElement('p');
    car.className = 'menu-car';
    car.append(t('menu.turntable'), this.carName);
    panel.append(title, this.loading, buttons, small, car);
    this.slides.className = 'menu-slides';
    this.slides.hidden = true;
    this.slides.append(this.slideImg, this.slideCaption);
    this.root.append(panel, this.slides);
    parent.appendChild(this.root);
  }

  /** The name of the car on the turntable. */
  setCar(name: string): void {
    if (this.carName.textContent !== name) this.carName.textContent = name;
  }

  /** Company image URLs for the slideshow (none = no slideshow). */
  setImages(urls: readonly string[]): void {
    this.images = [...urls];
    this.shownSlide = -1;
    this.slides.hidden = this.images.length === 0;
  }

  /** Rotate the loading message and the slideshow. Call every frame with the time in ms. */
  update(now: number): void {
    const m = cycleIndex(now, MENU.messageMs, this.messages.length);
    if (m !== this.shownMessage) {
      this.shownMessage = m;
      this.loading.textContent = this.messages[m]!;
      this.loading.classList.remove('fresh');
      void this.loading.offsetWidth;
      this.loading.classList.add('fresh');
    }
    if (this.images.length === 0) return;
    const s = cycleIndex(now, MENU.slideMs, this.images.length);
    if (s !== this.shownSlide) {
      this.shownSlide = s;
      const url = this.images[s]!;
      this.slideImg.src = url;
      this.slideCaption.textContent = captionOf(decodeURIComponent(url.split('/').pop() ?? ''));
    }
  }

  dispose(): void {
    this.root.remove();
  }
}
