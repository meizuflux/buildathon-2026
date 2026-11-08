// Deterministic demo scenario. Every name, address, coordinate, and authority here is fictional.
// Times are simulation minutes since midnight; the demo starts at 13:40.
import type { Broadcast, Closure, DemoHousehold, DemoShelter, Message, OfficialInstruction } from './types';

export const START_MINUTE = 13 * 60 + 40;
export const AUTHORITY = 'Tampa Bay Emergency Management (simulated)';

export const household: DemoHousehold = {
  id: 'HH-2041',
  name: 'Alvarez household',
  adults: 2,
  children: 2,
  childAges: [6, 9],
  dogs: 1,
  petNote: 'Medium dog, crate-trained',
  wheelchairEntrance: 'yes',
  poweredEquipment: 'no',
  vehicle: 'yes',
  transportHelp: 'no',
  location: { label: 'Seminole Heights, Tampa Bay (fictional)', lat: 27.9935, lng: -82.4585 },
};

const yes = (detail: string, reportedAt: number) => ({ state: 'confirmed' as const, detail, reportedAt });
const no = (detail: string, reportedAt: number) => ({ state: 'not_available' as const, detail, reportedAt });
const unknown = (detail: string, reportedAt: number) => ({ state: 'unknown' as const, detail, reportedAt });

export const shelters: DemoShelter[] = [
  {
    id: 'SH-03',
    name: 'Bayview Middle School',
    address: '4100 N Palm Ave, Tampa Bay (fictional)',
    operator: 'County school district (simulated)',
    lat: 28.0068,
    lng: -82.4519,
    status: 'open',
    spaces: 120,
    spacesReportedAt: 13 * 60 + 25,
    capabilities: {
      wheelchairEntrance: no('Main entrance has steps and no ramp. Confirmed by site staff.', 13 * 60 + 5),
      dogs: no('Pets are not accepted at this site.', 12 * 60 + 50),
      children: yes('Families with children accepted.', 12 * 60 + 50),
      poweredEquipment: yes('Backup power available for medical equipment.', 12 * 60 + 50),
    },
    routes: [
      {
        id: 'R-3A', via: 'N Palm Ave', minutes: 7, roads: ['palm-ave'],
        path: [[27.9935, -82.4585], [27.9990, -82.4570], [28.0040, -82.4540], [28.0068, -82.4519]],
      },
    ],
  },
  {
    id: 'SH-11',
    name: 'Lakeview Recreation Center',
    address: '7800 Lakeview Dr, Tampa Bay (fictional)',
    operator: 'Parks department (simulated)',
    lat: 28.0405,
    lng: -82.5010,
    status: 'open',
    spaces: 41,
    spacesReportedAt: 13 * 60 + 28,
    capabilities: {
      wheelchairEntrance: yes('Step-free entrance and accessible restrooms. Confirmed by site staff.', 13 * 60 + 10),
      dogs: yes('Dogs accepted in a separate pet area. Bring a crate.', 13 * 60 + 10),
      children: yes('Families with children accepted.', 13 * 60 + 10),
      poweredEquipment: yes('Backup power available for medical equipment.', 13 * 60 + 10),
    },
    routes: [
      {
        id: 'R-11A', via: 'Hillsborough Ave and Armenia Ave', minutes: 22, roads: ['hillsborough-ave', 'armenia-ave'],
        path: [[27.9935, -82.4585], [27.9960, -82.4700], [28.0050, -82.4820], [28.0230, -82.4900], [28.0405, -82.5010]],
      },
      {
        id: 'R-11B', via: 'Sligh Ave and Habana Ave', minutes: 29, roads: ['sligh-ave', 'habana-ave'],
        path: [[27.9935, -82.4585], [28.0110, -82.4600], [28.0120, -82.4800], [28.0300, -82.4950], [28.0405, -82.5010]],
      },
    ],
  },
  {
    id: 'SH-07',
    name: 'Northgate Church Hall',
    address: '2210 Northgate Blvd, Tampa Bay (fictional)',
    operator: 'Northgate community volunteers (simulated)',
    lat: 28.0300,
    lng: -82.4690,
    status: 'open',
    spaces: 18,
    spacesReportedAt: 13 * 60 + 20,
    capabilities: {
      wheelchairEntrance: unknown('Entrance accessibility has not been reported by the site.', 13 * 60 + 20),
      dogs: yes('Dogs accepted on leash or in a crate.', 13 * 60 + 20),
      children: yes('Families with children accepted.', 13 * 60 + 20),
      poweredEquipment: unknown('Backup power has not been reported.', 13 * 60 + 20),
    },
    routes: [
      {
        id: 'R-7A', via: 'N Florida Ave', minutes: 15, roads: ['florida-ave'],
        path: [[27.9935, -82.4585], [28.0050, -82.4600], [28.0180, -82.4640], [28.0300, -82.4690]],
      },
    ],
  },
];

/** Closures the presenter can trigger, in order. */
export const closureScript: Omit<Closure, 'at'>[] = [
  {
    id: 'CL-1', road: 'hillsborough-ave', label: 'Hillsborough Ave at the river',
    reason: 'Flooding', authority: AUTHORITY, point: [27.9960, -82.4700],
  },
  {
    id: 'CL-2', road: 'sligh-ave', label: 'Sligh Ave bridge',
    reason: 'Debris on the bridge', authority: AUTHORITY, point: [28.0115, -82.4700],
  },
];

export const instruction: OfficialInstruction = {
  id: 'OI-B-1315',
  level: 'mandatory',
  headline: 'Evacuate Zone B',
  details:
    'Residents of Zone B, including Seminole Heights, should leave by 18:00 today. Take essential items, ' +
    'medication, and pets. Follow posted detours.',
  authority: AUTHORITY,
  issuedAt: 13 * 60 + 15,
  leaveBy: 18 * 60,
};

export const initialBroadcasts: Broadcast[] = [
  {
    id: 'BC-1',
    title: 'Mandatory evacuation for Zone B',
    body: 'Leave by 18:00 today. Shelters are open across the county.',
    authority: AUTHORITY,
    severity: 'critical',
    at: 13 * 60 + 15,
  },
];

/** Broadcasts the presenter can send, in order. */
export const broadcastScript: Omit<Broadcast, 'at'>[] = [
  {
    id: 'BC-2',
    title: 'Road flooding in Zone B',
    body: 'Low-lying roads near the river are flooding. Do not drive through standing water. Allow extra time.',
    authority: AUTHORITY,
    severity: 'attention',
  },
  {
    id: 'BC-3',
    title: 'Shelter pet areas',
    body: 'Shelters that accept pets ask you to bring a crate, food, and vaccination records.',
    authority: AUTHORITY,
    severity: 'info',
  },
];

export const initialMessages: Message[] = [
  {
    id: 'MSG-1',
    from: 'coordinator',
    author: 'Jordan Lee',
    role: 'Shelter coordination desk',
    body: 'Hi! Message me here if your needs change or you have trouble getting there.',
    at: 13 * 60 + 22,
    simulated: true,
  },
];

/** Replies the demo coordinator sends, in order, after successful household messages. */
export const coordinatorReplies = [
  'Thanks, I have noted that. I will check with the site and reply here.',
  'Understood. I have passed this to the shelter team.',
];

/** Availability updates the presenter can trigger for the recommended site, in order. */
export const availabilityScript: { shelterId: string; spaces: number }[] = [
  { shelterId: 'SH-11', spaces: 6 },
  { shelterId: 'SH-11', spaces: 0 },
];

/** Shelter data older than this (simulation minutes) is shown as possibly out of date. */
export const STALE_AFTER_MINUTES = 60;
