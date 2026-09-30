import './ui/style.css';
import { Game } from './game/Game.ts';
import { registerGameTools } from './systems/webmcp.ts';

try {
  const game=new Game(document.getElementById('world') as HTMLCanvasElement);
  registerGameTools(game);
  // Development-only inspection surface for repeatable physics and streaming QA.
  if(import.meta.env.DEV)(window as unknown as {__drive:Game}).__drive=game;
}catch(error) {
  console.error('Spider Midnight could not start',error);
  const app=document.getElementById('app')!;
  const graphics=error instanceof Error&&/webgl|context/i.test(error.message);
  app.innerHTML='<main style="max-width:560px;margin:20vh auto;padding:32px;color:#f0f5f7"><h1>'+(graphics?'3D graphics unavailable':'The drive could not start')+'</h1><p>'+(graphics?'This drive needs WebGL 2. Enable hardware acceleration in your browser, then reload. If graphics are already enabled, try another desktop browser.':'Reload to try again. If the problem continues, share the browser console error with the developer.')+'</p><button id="retry-graphics" class="small-primary">Reload game</button></main>';
  document.getElementById('retry-graphics')!.addEventListener('click',()=>location.reload());
}
