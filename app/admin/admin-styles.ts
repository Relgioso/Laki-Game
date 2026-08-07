// Shared class strings for the admin screens, matching the yellow/black
// branding used throughout the play screens (Wheel, Color Game, Duck Race)
// instead of the generic gray/black form look these pages started with.
// Plain strings rather than components since each admin page already has
// its own layout/JSX structure -- this just standardizes the look.
export const adminStyles = {
  page: 'flex flex-1 flex-col items-center px-6 py-12 bg-[#fffdf5] dark:bg-[#150c00]',
  container: 'w-full max-w-3xl',
  title: 'text-2xl font-extrabold tracking-tight text-black dark:text-white mb-8 flex items-center gap-3',
  titleAccent: 'inline-block h-6 w-1.5 rounded-full bg-[#fad403]',
  sectionHeading: 'text-sm font-bold uppercase tracking-wide text-black dark:text-white mb-2',
  sectionSubtext: 'text-xs text-zinc-600 dark:text-zinc-400 mb-3',
  card: 'rounded-2xl border-2 border-black/10 dark:border-white/15 bg-white dark:bg-zinc-900 p-4 shadow-[0_2px_0_rgba(0,0,0,0.06)]',
  input:
    'rounded-lg border-2 border-black/10 dark:border-white/20 bg-transparent px-3 py-2 text-sm text-black dark:text-white focus:outline-none focus:border-[#fad403] focus:ring-2 focus:ring-[#fad403]/40',
  fieldLabel: 'text-xs font-medium text-zinc-600 dark:text-zinc-400',
  primaryButton:
    'rounded-full bg-[#fad403] text-black px-6 py-2.5 text-sm font-extrabold uppercase tracking-wide shadow-[0_4px_0_#cc9700] transition-transform active:translate-y-[2px] active:shadow-[0_2px_0_#cc9700] disabled:opacity-50 disabled:active:translate-y-0 disabled:active:shadow-[0_4px_0_#cc9700]',
  secondaryButton:
    'rounded-full border-2 border-black dark:border-white bg-white dark:bg-transparent text-black dark:text-white px-4 py-1.5 text-sm font-bold transition-colors hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black',
  dangerLink: 'text-sm font-bold text-red-600 dark:text-red-400 hover:underline',
  badge: 'inline-block rounded-full bg-[#fad403] px-3 py-1 text-xs font-extrabold text-black',
  checkboxLabel: 'flex items-center gap-2 text-sm font-medium text-black dark:text-white',
  messageSuccess:
    'mb-4 rounded-xl border-2 border-green-400 bg-green-50 dark:border-green-800 dark:bg-green-950 p-3 text-sm font-medium text-green-800 dark:text-green-300',
  messageError:
    'mb-4 rounded-xl border-2 border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950 p-3 text-sm font-medium text-red-800 dark:text-red-300',
  loadErrorBox:
    'w-full max-w-md rounded-xl border-2 border-red-400 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4 text-sm text-red-800 dark:text-red-300',
  emptyState:
    'text-sm text-zinc-600 dark:text-zinc-400 border-2 border-dashed border-black/15 dark:border-white/20 rounded-2xl p-6 text-center',
}
