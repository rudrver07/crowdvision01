import type { VoiceLanguage } from './types.ts';

/**
 * Construct concise, natural, professional operational announcements.
 * Supports English ('en') and Hindi ('hi').
 * Uses strictly verified fields from the source alert. Never fabricates values or locations.
 */
export function formatOperationalAnnouncement(alert: any, language: VoiceLanguage = 'en'): string {
  // If alert carries custom spoken text / narration message, prioritize it
  if (language === 'hi' && alert.spoken_text_hi) {
    return alert.spoken_text_hi;
  }
  if (language === 'en' && alert.spoken_text) {
    return alert.spoken_text;
  }
  if (alert.spoken_text && typeof alert.spoken_text === 'string') {
    return alert.spoken_text;
  }

  const zoneName = String(alert.zone_name || alert.zoneName || 'Designated Zone').trim();
  const severity = String(alert.severity || 'HIGH').toUpperCase();
  const category = String(alert.category || 'occupancy_warning').toLowerCase();

  const measurements = alert.supporting_measurements || alert.supportingMeasurements || {};
  let occPct: number | null = null;
  const occRatio = measurements.occupancy_ratio ?? measurements.occupancyRatio;
  if (typeof occRatio === 'number' && !isNaN(occRatio)) {
    occPct = Math.round(occRatio * 100);
  } else if (typeof alert.occupancyPct === 'number' && !isNaN(alert.occupancyPct)) {
    occPct = Math.round(alert.occupancyPct);
  }

  if (language === 'hi') {
    return formatHindi(zoneName, severity, category, occPct);
  }
  return formatEnglish(zoneName, severity, category, occPct);
}

function formatEnglish(zoneName: string, severity: string, category: string, occPct: number | null): string {
  if (severity === 'CRITICAL' || category === 'critical_density') {
    if (occPct !== null) {
      return `Attention. Critical crowd surge detected at ${zoneName}. Current occupancy is ${occPct} percent. Immediate action required.`;
    }
    return `Attention. Critical crowd surge detected at ${zoneName}. Immediate action required.`;
  }

  if (category.includes('bottleneck')) {
    return `Attention. Crowd bottleneck detected at ${zoneName}.`;
  }

  if (category.includes('counterflow')) {
    return `Warning. Counterflow detected at ${zoneName}.`;
  }

  if (category.includes('rapid') || category.includes('accumulation')) {
    return `Warning. Rapid crowd accumulation at ${zoneName}.`;
  }

  if (occPct !== null) {
    return `Attention. High crowd density detected at ${zoneName}. Current occupancy is ${occPct} percent.`;
  }

  return `Attention. High crowd density detected at ${zoneName}.`;
}

function formatHindi(zoneName: string, severity: string, category: string, occPct: number | null): string {
  if (severity === 'CRITICAL' || category === 'critical_density') {
    if (occPct !== null) {
      return `सावधान। ${zoneName} पर आपातकालीन स्थिति और अत्यधिक भीड़ है। वर्तमान ऑक्यूपेंसी ${occPct} प्रतिशत है। तुरंत कार्रवाई की आवश्यकता है।`;
    }
    return `सावधान। ${zoneName} पर आपातकालीन स्थिति और अत्यधिक भीड़ है। तुरंत कार्रवाई की आवश्यकता है।`;
  }

  if (category.includes('bottleneck')) {
    return `सावधान। ${zoneName} पर बॉटलनेक की स्थिति बनी है।`;
  }

  if (category.includes('counterflow')) {
    return `सावधान। ${zoneName} पर विपरीत दिशा में भीड़ का प्रवाह देखा गया है।`;
  }

  if (category.includes('rapid') || category.includes('accumulation')) {
    return `चेतावनी। ${zoneName} पर भीड़ तेज़ी से बढ़ रही है।`;
  }

  if (occPct !== null) {
    return `सावधान। ${zoneName} पर भीड़ का घनत्व अधिक है। वर्तमान ऑक्यूपेंसी ${occPct} प्रतिशत है।`;
  }

  return `सावधान। ${zoneName} पर भीड़ का घनत्व अधिक है।`;
}
