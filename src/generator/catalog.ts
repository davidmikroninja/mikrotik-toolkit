import type { FabricId } from './types';

export interface RouteServerSession {
  label: string;
  asn: number;
  v4: string;
  v6: string;
}

export interface PeerSession {
  label: string;
  v4: string;
  v6: string;
}

export interface PeerGroup {
  id: string;
  name: string;
  asn: number;
  fabric: FabricId;
  sessions: PeerSession[];
}

export interface Fabric {
  id: FabricId;
  label: string;
  shortLabel: string;
  routeServers: RouteServerSession[];
  rpkiServers: string[];
  rpkiGroup: string;
  defaultLocalPref: number;
}

/**
 * Peer data transcribed from the public MikroTikSA/INX-bgp-setup script.
 * Addresses and ASNs are the NAP Africa route-server and bilateral sessions
 * that script shipped with. Treat this catalog as data to review: peers move
 * addresses, and bilateral sessions are opt-in.
 */
export const FABRICS: Record<FabricId, Fabric> = {
  ct: {
    id: 'ct',
    label: 'NAP Africa Cape Town',
    shortLabel: 'NAP CT',
    rpkiGroup: 'NAPCT',
    rpkiServers: ['196.60.70.2', '196.60.70.3'],
    defaultLocalPref: 300,
    routeServers: [
      { label: 'collector', asn: 37186, v4: '196.60.70.1', v6: '2001:43f8:6d1::1' },
      { label: 'primary', asn: 37195, v4: '196.60.70.2', v6: '2001:43f8:6d1::2' },
      { label: 'secondary', asn: 37195, v4: '196.60.70.3', v6: '2001:43f8:6d1::3' },
    ],
  },
  jb: {
    id: 'jb',
    label: 'NAP Africa Johannesburg',
    shortLabel: 'NAP JB',
    rpkiGroup: 'NAPJB',
    rpkiServers: ['196.60.9.2', '196.60.9.3'],
    defaultLocalPref: 350,
    routeServers: [
      { label: 'collector', asn: 37186, v4: '196.60.9.1', v6: '2001:43f8:6d0::1' },
      { label: 'primary', asn: 37195, v4: '196.60.9.2', v6: '2001:43f8:6d0::2' },
      { label: 'secondary', asn: 37195, v4: '196.60.9.3', v6: '2001:43f8:6d0::3' },
    ],
  },
};

/**
 * Bilateral (settlement-free) peers from the original script. Selecting a
 * group enables all of its sessions on the listed fabric. They are disabled
 * by default in the original because each one needs its own agreement.
 */
export const PEER_GROUPS: PeerGroup[] = [
  {
    id: 'akamai',
    name: 'Akamai',
    asn: 20940,
    fabric: 'ct',
    sessions: [{ label: 'primary', v4: '196.60.70.113', v6: '2001:43f8:6d1::113' }],
  },
  {
    id: 'amazon',
    name: 'Amazon',
    asn: 16509,
    fabric: 'ct',
    sessions: [
      { label: 'primary', v4: '196.60.70.105', v6: '2001:43f8:6d1::105' },
      { label: 'secondary', v4: '196.60.70.110', v6: '2001:43f8:6d1::110' },
    ],
  },
  {
    id: 'microsoft',
    name: 'Microsoft',
    asn: 8075,
    fabric: 'ct',
    sessions: [
      { label: 'primary', v4: '196.60.70.47', v6: '2001:43f8:6d1::47' },
      { label: 'secondary', v4: '196.60.70.147', v6: '2001:43f8:6d1::147' },
    ],
  },
  {
    id: 'netflix',
    name: 'Netflix',
    asn: 2906,
    fabric: 'jb',
    sessions: [
      { label: 'primary', v4: '196.60.8.80', v6: '2001:43f8:6d0::80' },
      { label: 'secondary', v4: '196.60.8.100', v6: '2001:43f8:6d0::100' },
    ],
  },
  {
    id: 'apple',
    name: 'Apple',
    asn: 714,
    fabric: 'jb',
    sessions: [
      { label: 'primary', v4: '196.60.9.161', v6: '2001:43f8:6d0::9:161' },
      { label: 'secondary', v4: '196.60.9.162', v6: '2001:43f8:6d0::9:162' },
    ],
  },
  {
    id: 'facebook',
    name: 'Facebook',
    asn: 32934,
    fabric: 'jb',
    sessions: [
      { label: 'primary', v4: '196.60.9.15', v6: '2001:43f8:6d0::2934' },
      { label: 'secondary', v4: '196.60.9.16', v6: '2001:43f8:6d0::934' },
      { label: 'tertiary', v4: '196.60.10.3', v6: '2001:43f8:6d0::10:3' },
      { label: 'quaternary', v4: '196.60.10.4', v6: '2001:43f8:6d0::10:4' },
    ],
  },
];

export function peerGroupsForFabric(fabric: FabricId): PeerGroup[] {
  return PEER_GROUPS.filter((group) => group.fabric === fabric);
}

export function findPeerGroup(id: string): PeerGroup | undefined {
  return PEER_GROUPS.find((group) => group.id === id);
}
