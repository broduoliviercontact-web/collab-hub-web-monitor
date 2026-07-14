// Persistance locale du dernier contenu reçu (Lot 3A).
// Pur vis-à-vis du DOM : reçoit un objet `storage` injectable (localStorage en
// prod, un faux objet en tests). N'envoie jamais rien vers un serveur.
//
// Clé versionnée : `collabHubSoundState:v1`. Format :
//   { version: 1, updatedAt: "<ISO>", fields: { sound_title, ... } }
//
// Strict à la lecture : JSON corrompu, version inconnue, structure inattendue,
// headers inconnus, types non string ou champs trop longs -> ignorés (retour
// aux valeurs par défaut). Aucune donnée HTML, aucun innerHTML ; sound_link
// n'est pas validé ici — il repasse par la validation URL existante au rendu.
import { KNOWN_HEADERS } from '../collabHub/messageRouter.js';

export const STORAGE_KEY = 'collabHubSoundState:v1';
export const STORAGE_VERSION = 1;
const MAX_FIELD_LEN = 4096; // valeur raisonnable : un champ texte éditorial.

// Construit le payload à persister (uniquement les 6 headers connus, strings).
export function serializeSoundState(snapshot, updatedAt) {
  const fields = {};
  for (const h of KNOWN_HEADERS) {
    const v = snapshot && snapshot[h];
    if (typeof v === 'string') fields[h] = v;
  }
  return { version: STORAGE_VERSION, updatedAt, fields };
}

// Persiste l'état. `now` injectable pour les tests. Renvoie le payload écrit
// ou false si le storage est indisponible / l'écriture lève. Jamais de throw.
export function saveSoundState(storage, snapshot, now = defaultNow) {
  if (!storage || typeof storage.setItem !== 'function') return false;
  try {
    const payload = serializeSoundState(snapshot, now());
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
  } catch {
    return false;
  }
}

// Charge et valide strictement. Renvoie { fields, updatedAt } | null.
// null = absent / corrompu / incompatible -> l'appelant garde les défauts.
export function loadSoundState(storage) {
  if (!storage || typeof storage.getItem !== 'function') return null;
  let raw;
  try { raw = storage.getItem(STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  let data;
  try { data = JSON.parse(raw); } catch { return null; } // JSON corrompu
  if (!data || typeof data !== 'object') return null;
  if (data.version !== STORAGE_VERSION) return null; // version inconnue
  if (typeof data.updatedAt !== 'string' || data.updatedAt === '') return null;
  const src = data.fields;
  if (!src || typeof src !== 'object') return null;
  const fields = {};
  for (const h of KNOWN_HEADERS) {
    const v = src[h];
    if (typeof v !== 'string') continue; // type non string ignoré
    if (v.length > MAX_FIELD_LEN) continue; // champ trop long ignoré
    fields[h] = v; // headers inconnus ignorés (on ne lit que KNOWN_HEADERS)
  }
  return { fields, updatedAt: data.updatedAt };
}

// Efface l'état local. Renvoie true si supprimé, false si storage indispo.
export function clearSoundState(storage) {
  if (!storage || typeof storage.removeItem !== 'function') return false;
  try { storage.removeItem(STORAGE_KEY); return true; } catch { return false; }
}

function defaultNow() { return new Date().toISOString(); }
