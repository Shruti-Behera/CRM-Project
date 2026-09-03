/* Department + level based module visibility (mirrored on the server in
   Scope.SegmentsFor / SegmentForPath).

     Level 1 & 2      -> all three modules
     everyone below   -> only the module their department is mapped to
                         (departments.main_module); unmapped -> Internal Work

   Driven entirely by the department's stored Main Module — no hardcoded
   department names. Mirrored on the server so hidden modules can't be reached
   by URL or API. */

// The three fixed Main Modules: stored value + label shown in the UI.
export const MAIN_MODULES = [
  { value: 'banking', label: 'Investment Banking & Merchant Banking' },
  { value: 'institutional', label: 'Institutional Business' },
  { value: 'internal', label: 'Internal Work' }
];
export const moduleLabel = (v) => MAIN_MODULES.find(m => m.value === v)?.label || '';

export function allowedSegments(user) {
  const level = Number(user?.level);
  if (level === 1 || level === 2) return new Set(['banking', 'institutional', 'internal']);
  const mod = (user?.main_module || '').trim().toLowerCase();
  if (mod === 'banking') return new Set(['banking']);
  if (mod === 'institutional') return new Set(['institutional']);
  return new Set(['internal']);
}

// The workspace to land on, given what a user is allowed to see.
export function homePath(user) {
  const segs = allowedSegments(user);
  if (segs.has('banking')) return '/banking';
  if (segs.has('institutional')) return '/institutional';
  return '/internal';
}
