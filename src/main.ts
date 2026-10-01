import { Application, Graphics, Text } from 'pixi.js';

// Placeholder boot screen for the scaffold: proves Pixi renders on device.
// Replaced by the real scene in T7.
async function boot(): Promise<void> {
  const app = new Application();
  await app.init({
    resizeTo: window,
    background: '#f4efe2',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio, 2),
    autoDensity: true,
  });
  document.getElementById('app')!.appendChild(app.canvas);

  const title = new Text({ text: 'Potato Kid', style: { fill: '#222', fontSize: 32, fontFamily: 'sans-serif' } });
  title.anchor.set(0.5);
  app.stage.addChild(title);

  const potato = new Graphics()
    .ellipse(0, 0, 40, 34)
    .fill('#fffaf0')
    .stroke({ color: '#111', width: 3 })
    .circle(-12, -6, 2)
    .circle(12, -6, 2)
    .fill('#111');
  app.stage.addChild(potato);

  let t = 0;
  app.ticker.add((ticker) => {
    t += ticker.deltaMS / 1000;
    title.position.set(app.screen.width / 2, app.screen.height * 0.3);
    potato.position.set(app.screen.width / 2, app.screen.height * 0.5 - Math.abs(Math.sin(t * 4)) * 12);
  });

  (window as unknown as { __PK_READY__: boolean }).__PK_READY__ = true;
}

void boot();
