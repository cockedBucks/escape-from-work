// Main menu (P8.1, GAME_DESIGN §11): title, fake IT loading messages, wobbly PLAY, a big HONK
// button, the car on the turntable, and a slideshow of company images (assets/menu/).

/** Fake IT loading messages (original text; no real products or brands). */
export const LOADING_MESSAGES = [
  'Waiting for IT to approve your ticket…',
  'Rebooting the coffee machine…',
  'Defragmenting the parking lot…',
  'Updating your updates…',
  'Asking the printer nicely…',
  'Clearing the cache (and your calendar)…',
  'Reconnecting to the Wi-Fi of hope…',
  'Restarting the mail client, again…',
  'Locating meeting room 4B… still looking…',
  'Untangling the cable drawer…',
  'Reply-all storm detected, taking cover…',
  'Turning it off and on again…',
] as const;

/** How often the loading message and the slideshow image change (ms). */
const MESSAGE_MS = 2600;
const SLIDE_MS = 5000;

/** Which of `count` items shows at `now` ms when each stays `periodMs`. Pure, for tests. */
export const cycleIndex = (now: number, periodMs: number, count: number): number =>
  count <= 0 ? 0 : Math.floor(Math.max(now, 0) / periodMs) % count;

/** "office-party_2025.jpg" → "office party 2025" (slideshow caption). */
export const captionOf = (file: string): string => file.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();

export interface MainMenuHandlers {
  onPlay(): void;
  onHonk(): void;
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
    const play = document.createElement('button');
    play.type = 'button';
    play.className = 'menu-play wobbly';
    play.dataset.action = 'play';
    play.textContent = 'PLAY';
    play.addEventListener('click', () => handlers.onPlay());
    this.honk.type = 'button';
    this.honk.className = 'menu-honk wobbly';
    this.honk.dataset.action = 'honk';
    this.honk.textContent = 'HONK!';
    this.honk.addEventListener('click', () => {
      handlers.onHonk();
      this.honk.classList.remove('honked');
      void this.honk.offsetWidth; // restart the squish
      this.honk.classList.add('honked');
    });
    const buttons = document.createElement('div');
    buttons.className = 'menu-buttons';
    buttons.append(play, this.honk);
    const car = document.createElement('p');
    car.className = 'menu-car';
    car.append('On the turntable: ', this.carName);
    panel.append(title, this.loading, buttons, car);
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
    const m = cycleIndex(now, MESSAGE_MS, LOADING_MESSAGES.length);
    if (m !== this.shownMessage) {
      this.shownMessage = m;
      this.loading.textContent = LOADING_MESSAGES[m]!;
      this.loading.classList.remove('fresh');
      void this.loading.offsetWidth;
      this.loading.classList.add('fresh');
    }
    if (this.images.length === 0) return;
    const s = cycleIndex(now, SLIDE_MS, this.images.length);
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
