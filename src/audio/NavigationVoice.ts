export type NavigationAnnouncementStage = 'advance' | 'approach' | 'immediate' | 'completed';

export interface ManeuverEvent {
  id: string;
  type: 'station' | 'bridge' | 'tunnel' | 'curve' | 'region';
  stationS: number;
  name?: string;
}

export class NavigationVoice {
  private isSupported = false;
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice: SpeechSynthesisVoice | null = null;
  private preferredVoiceId = '';

  private enabled = true;
  private volume = 0.85;

  // Track spoken announcement stages for each maneuver: maneuverId -> Set of stages
  private spokenStages = new Map<string, Set<NavigationAnnouncementStage>>();
  private lastSpokenRegion = '';
  private lastCruiseCallS = 0;
  private lastSpokenText = '';
  private lastSpokenTime = 0;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.isSupported = true;
      this.synth = window.speechSynthesis;
      this.initVoices();
    }
  }

  private initVoices() {
    if (!this.synth) return;

    const loadVoices = () => {
      this.voices = this.synth!.getVoices();
      this.resolveVoice();
    };

    loadVoices();
    if (typeof this.synth.onvoiceschanged !== 'undefined') {
      this.synth.onvoiceschanged = loadVoices;
    }
  }

  public getAvailableEnglishVoices(): { id: string; name: string; lang: string; isFemale: boolean }[] {
    const enVoices = this.voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    const list = enVoices.length > 0 ? enVoices : this.voices;

    return list.map(v => ({
      id: v.voiceURI || v.name,
      name: v.name,
      lang: v.lang,
      isFemale: this.isFemaleVoice(v.name),
    }));
  }

  private isFemaleVoice(name: string): boolean {
    const lower = name.toLowerCase();
    const femaleKeywords = [
      'female', 'woman', 'girl', 'zira', 'samantha', 'victoria', 'karen', 'susan', 'serena',
      'aria', 'jenny', 'stephanie', 'catherine', 'hazel', 'fiona', 'moira', 'veena',
      'google us english', 'natural (female)', 'online (natural)'
    ];
    return femaleKeywords.some(k => lower.includes(k));
  }

  private resolveVoice() {
    if (!this.voices.length) return;

    // 1. Check if user configured a specific voice ID
    if (this.preferredVoiceId) {
      const match = this.voices.find(v => (v.voiceURI || v.name) === this.preferredVoiceId);
      if (match) {
        this.selectedVoice = match;
        return;
      }
    }

    // 2. Filter English voices
    const enVoices = this.voices.filter(v => v.lang.toLowerCase().startsWith('en'));
    const pool = enVoices.length > 0 ? enVoices : this.voices;

    // 3. Search for preferred natural female English voices
    // Prioritize high-quality neural / natural / popular female voice names
    const preferredOrder = [
      'aria', 'jenny', 'samantha', 'zira', 'serena', 'victoria', 'karen',
      'natural', 'google us english', 'female'
    ];

    for (const key of preferredOrder) {
      const found = pool.find(v => v.name.toLowerCase().includes(key));
      if (found) {
        this.selectedVoice = found;
        return;
      }
    }

    // 4. Any English voice
    if (enVoices.length > 0) {
      this.selectedVoice = enVoices[0];
      return;
    }

    // 5. Default browser voice
    this.selectedVoice = this.voices.find(v => v.default) || this.voices[0] || null;
  }

  public setSettings(enabled: boolean, volume: number, voiceId?: string) {
    this.enabled = enabled;
    this.volume = Math.max(0, Math.min(1, volume));
    if (voiceId !== undefined) {
      this.preferredVoiceId = voiceId;
      this.resolveVoice();
    }
    if (!enabled && this.synth) {
      this.synth.cancel();
    }
  }

  public cancel() {
    if (this.synth) {
      this.synth.cancel();
    }
  }

  public speak(text: string, forceInterrupt = false) {
    if (!this.isSupported || !this.synth || !this.enabled || this.volume <= 0.01) return;

    const now = performance.now();
    // Debounce exact duplicates within 4 seconds
    if (this.lastSpokenText === text && now - this.lastSpokenTime < 4000) {
      return;
    }

    if (forceInterrupt) {
      this.synth.cancel();
    }

    try {
      const utterance = new SpeechSynthesisUtterance(text);
      if (this.selectedVoice) {
        utterance.voice = this.selectedVoice;
      }
      utterance.volume = this.volume;
      utterance.rate = 1.02; // Calm, clear, navigation-like tempo
      utterance.pitch = 1.0; // Natural pitch

      utterance.onend = () => {
        // Speech completed smoothly
      };

      utterance.onerror = () => {
        // Graceful error recovery
      };

      this.lastSpokenText = text;
      this.lastSpokenTime = now;
      this.synth.speak(utterance);
    } catch {
      // Graceful fallback if speech synthesis throws
    }
  }

  /**
   * Evaluates navigation state along road ahead and speaks distance-aware instructions.
   */
  public updateNavigation(
    currentS: number,
    speedMps: number,
    regionName: string,
    upcomingEvents: ManeuverEvent[],
    moving = true
  ) {
    if (!this.enabled || !moving) return;

    const speedKmh = Math.abs(speedMps) * 3.6;

    // 1. Region Entry Announcement
    if (regionName && regionName !== this.lastSpokenRegion) {
      this.lastSpokenRegion = regionName;
      if (currentS > 50) { // Don't speak immediately on initial frame load to avoid clutter
        this.speak(`Entering ${regionName}.`, true);
      }
    }

    // Dynamic distance thresholds based on speed (highway speeds announce earlier)
    const advanceDist = Math.max(380, speedMps * 12);  // ~400m at 120 km/h
    const approachDist = Math.max(140, speedMps * 5);  // ~165m at 120 km/h
    const immediateDist = Math.max(35, speedMps * 1.5); // ~50m at 120 km/h

    // 2. Process Upcoming Maneuvers & POIs
    for (const event of upcomingEvents) {
      const distance = event.stationS - currentS;
      if (distance < -30) {
        // Event is behind player, cleanup spoken records
        continue;
      }

      let stages = this.spokenStages.get(event.id);
      if (!stages) {
        stages = new Set<NavigationAnnouncementStage>();
        this.spokenStages.set(event.id, stages);
      }

      // Format distance in round numbers (e.g. "500 meters", "300 meters")
      const roundedDist = Math.round(distance / 50) * 50;

      // STAGE 1: ADVANCE NOTICE
      if (distance <= advanceDist && distance > approachDist) {
        if (!stages.has('advance')) {
          stages.add('advance');
          const speech = this.getAdvanceSpeech(event.type, roundedDist);
          if (speech) this.speak(speech, false);
        }
      }
      // STAGE 2: APPROACH NOTICE
      else if (distance <= approachDist && distance > immediateDist) {
        if (!stages.has('approach')) {
          stages.add('approach');
          const speech = this.getApproachSpeech(event.type);
          if (speech) this.speak(speech, true);
        }
      }
      // STAGE 3: IMMEDIATE NOTICE
      else if (distance <= immediateDist && distance > 0) {
        if (!stages.has('immediate')) {
          stages.add('immediate');
          const speech = this.getImmediateSpeech(event.type);
          if (speech) this.speak(speech, true);
        }
      }
    }

    // 3. Periodic Open Highway Straight Cruise Encouragement (every 2.5 km during calm driving)
    if (currentS - this.lastCruiseCallS > 2500 && upcomingEvents.length === 0 && speedKmh > 50) {
      this.lastCruiseCallS = currentS;
      this.speak('Continue straight on Pacific Coast Highway.', false);
    }

    // Trim old spoken stages map to maintain small memory footprint
    if (this.spokenStages.size > 50) {
      for (const [id] of this.spokenStages) {
        const parsedS = parseFloat(id.split('_')[1] || '0');
        if (parsedS > 0 && currentS - parsedS > 1000) {
          this.spokenStages.delete(id);
        }
      }
    }
  }

  private getAdvanceSpeech(type: ManeuverEvent['type'], distanceM: number): string {
    const distStr = distanceM >= 1000 ? `${(distanceM / 1000).toFixed(1)} kilometers` : `${distanceM} meters`;
    switch (type) {
      case 'station':
        return `In ${distStr}, fuel and rest stop ahead on the right.`;
      case 'bridge':
        return `In ${distStr}, coastal bridge crossing ahead.`;
      case 'tunnel':
        return `In ${distStr}, mountain tunnel entrance ahead.`;
      case 'curve':
        return `In ${distStr}, sharp curve ahead. Reduce speed.`;
      default:
        return '';
    }
  }

  private getApproachSpeech(type: ManeuverEvent['type']): string {
    switch (type) {
      case 'station':
        return 'Fuel station approaching on the right.';
      case 'bridge':
        return 'Bridge crossing ahead.';
      case 'tunnel':
        return 'Tunnel ahead.';
      case 'curve':
        return 'Caution, sharp curve ahead.';
      default:
        return '';
    }
  }

  private getImmediateSpeech(type: ManeuverEvent['type']): string {
    switch (type) {
      case 'station':
        return 'Fuel and service on your right.';
      case 'bridge':
        return 'Entering bridge.';
      case 'tunnel':
        return 'Entering tunnel.';
      case 'curve':
        return 'Curve ahead.';
      default:
        return '';
    }
  }

  public dispose() {
    this.cancel();
    this.spokenStages.clear();
  }
}
