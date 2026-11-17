import { generatedHeader } from './header';
import { MIN_ROUTEROS_MINOR, type GeneratedFile, type GenerationMeta } from './types';
import { lines } from './utils';

export function generatePreflightFile(meta: GenerationMeta): GeneratedFile {
  const content = lines(
    generatedHeader(meta, 'Preflight: version check and backup', [
      'Run this first. It aborts if RouterOS is older than 7.20.',
      'It writes pre-gen-backup.backup and pre-gen-backup.rsc to the router files.',
    ]),
    '# --- RouterOS version check -------------------------------------------------',
    ':local ver [/system resource get version]',
    ':local dot [:find $ver "."]',
    ':if ($dot = nil) do={ :error ("GEN: cannot parse RouterOS version: " . $ver) }',
    ':local major [:tonum [:pick $ver 0 $dot]]',
    ':local rest ([:pick $ver ($dot + 1) [:len $ver]] . ".")',
    ':local dot2 [:find $rest "."]',
    ':local minor [:tonum [:pick $rest 0 $dot2]]',
    ':if ($major < 7) do={ :error ("GEN: RouterOS 7.20+ is required, found " . $ver) }',
    `:if ($major = 7) do={ :if ($minor < ${MIN_ROUTEROS_MINOR}) do={ :error ("GEN: RouterOS 7.20+ is required, found " . $ver) } }`,
    ':log info ("GEN: RouterOS version " . $ver . " is supported")',
    '',
    '# --- Backup before changes --------------------------------------------------',
    '# Download both files from the router before continuing.',
    '/system backup save name=pre-gen-backup',
    '/export file=pre-gen-backup',
    ':log info "GEN: backup saved as pre-gen-backup.backup and pre-gen-backup.rsc"',
    '',
    '# If the import fails or you lose management access:',
    '#   /system backup load name=pre-gen-backup',
    '# or restore the .backup file from Winbox.',
  );
  return {
    name: '00-preflight.rsc',
    content: content + '\n',
    language: 'routeros',
    description: 'RouterOS version gate and configuration backup.',
  };
}
