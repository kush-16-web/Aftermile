import { emptyControls } from '../vehicle/VehicleInput.ts';
export class InputManager {
  keys = emptyControls();
  onAction: (key:string) => void = () => {};
  enabled = false;
  private pressed=new Set<string>();
  constructor() {
    const mapping: Record<string,keyof typeof this.keys> = {KeyW:'throttle',ArrowUp:'throttle',KeyS:'brake',ArrowDown:'brake',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'handbrake',KeyE:'refuel'};
    window.addEventListener('keydown', e => {
      const target=e.target as HTMLElement;
      if (target.matches('input,select,textarea,[contenteditable="true"]') && e.code !== 'Escape') return;
      if(target.matches('button')&&['Space','Enter'].includes(e.code))return;
      if (this.enabled && mapping[e.code]) { this.pressed.add(e.code);this.keys[mapping[e.code]] = true; e.preventDefault(); }
      if (!e.repeat && ['Escape','KeyC','KeyR','KeyH','KeyM','KeyL','F2'].includes(e.code)) {this.onAction(e.code);e.preventDefault();}
    });
    window.addEventListener('keyup', e => {this.pressed.delete(e.code);if(mapping[e.code])this.keys[mapping[e.code]]=[...this.pressed].some(code=>mapping[code]===mapping[e.code]);});
    window.addEventListener('blur', () => this.clear());
  }
  clear() { this.pressed.clear();Object.assign(this.keys, emptyControls()); }
}
