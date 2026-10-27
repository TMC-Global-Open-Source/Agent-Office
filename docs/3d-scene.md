# 3D scene extension guide

`OfficeScene` owns the orthographic camera, lights, floor, optional decorations, and workstation layout. `Workstation` is a reusable procedural desk/chair/monitor component. `AgentAvatar` builds a low-poly figure from simple boxes and updates limb/head transforms inside React Three Fiber's frame loop rather than scheduling React state per frame.

The default camera zoom is 50 (reset restores this scale), with manual zoom from 18 to 100. Desk name/status labels use camera-facing billboards and larger text for readability.

On desktop, the canvas fills the remaining viewport height after the header, toolbar,
caption and footer, without a fixed maximum height. Resizing the window expands the
visible office at the existing zoom rather than scaling the agents. Short windows keep
a 240px minimum canvas and can scroll; mobile retains its stacked, scrollable layout.

Use local primitive geometries and shared status colors. Keep an animation state explicit, and honor reduced-motion preference by disabling entrance motion and camera movement. Add furniture as a small component in `apps/web/src/office`, then compose it in `Workstation` or `OfficeScene`. Avoid external model dependencies and photorealistic textures.

Desk row/column assignments come from SQLite and are deterministic. Regular desk positions
are not recalculated when the agent list changes. `subagent-layout.ts` overrides only child
desk positions in the scene to collect siblings in separate three-column team bays;
`SubagentTeams` draws flat floor outlines and parent labels, not walls. The full roster
determines grouping so filters do not move desks. Team bays expand as children join, and
subsequent bays may move to avoid overlap. SQLite assignments remain unchanged.

New agents receive a random shirt/cap color when their avatar profile is created,
including seeded demo agents. Colors are saved in SQLite and retained across status
updates, refreshes, and restarts; existing profiles are not recolored. Provider-generated
identity colors are fallback data, not a replacement for the saved joining color.
Select an agent and use **Avatar color** / **Save color** in its profile to override the
joining color. The validated hex color is persisted in the avatar profile and broadcast
to connected dashboards, updating both the figure and roster badge.

Idle agents move into stable seats in `LivingRoom`; other statuses return to their desks.
The existing lounge provides eight seats. Additional couch bays are added only when
the active office headcount exceeds eight (one bay per eight present agents).
Offline agents and working agents explicitly reporting `officeActivity: "away"` do
not count; idle, completed, joining and queued agents still do. Filters never change
lounge capacity. When headcount shrinks, occupants of removed bays move into free
seats in the remaining lounge.
An empty roster after a successful load shows "The office is empty", not a pending
first-sync message. Desks appear when agents join or return.
`AgentPresence` positions the avatar independently of the furniture. Couch avatars have bent
seated legs and deterministic reading, coffee-sipping, or reclining/stretching personalities.
`lounge-animation.ts` generates staggered poses without per-frame React updates. Reduced-motion
mode retains a static relaxed pose, and status changes reset the couch transforms and props.

Couch arrivals approach from the front, turn and back into the seat, then ease into
the cushion over one second. Departures pause for a 0.8-second forward lean and push-up
before walking. A continuous hip/knee rig blends between bent and straight legs instead
of swapping meshes; reading/coffee props are put away while transitioning.
`couch-motion.ts` shares the timing with water and game routes so agents do not slide
away during the rise. Interrupted transitions reverse from the current pose; reduced
motion switches directly to the final pose.

`WaterCooler` sits beside the lounge. `water-cooler.ts` schedules one idle visitor at
a time after an initial 20–45-second wait, followed by 30–70 seconds between visits.
Agents walk along the front/side lounge aisles at 1.5 world units per second, drink for
five seconds, and return to their reserved couch seat. Each completed return selects
a different reading, sipping, or reclining task. New work immediately cancels the visit.
The scheduler uses the full idle roster and bounded frame time, so filters do not
cancel breaks and hidden tabs do not fast-forward them. Reduced-motion mode suppresses
visits and retains static couch poses. Breaks are visual only and do not modify provider status.

`CoffeeMaker` sits in a small kitchenette to the right of the first lounge's right-hand
couch, with L-shaped paneled base cabinets, a light counter and a sink/faucet.
The short return extends inward at the top end; the coffee maker sits on this return,
facing the front aisle for visibility from the default camera. Agents approach its
front to brew. There is no backsplash. Both legs of the counter are included in furniture avoidance.
It sits at the outer right edge opposite the game cabinets, rotated 90 degrees to
face inward toward them; agents approach from the central right-side aisle and face
the machine while brewing.
The former standalone brown decorative block is removed; the whole kitchenette footprint
is included in furniture avoidance, with a clear right-side aisle for coffee runs. Idle/completed
lounge agents occasionally visit it, one at a time: stand, walk along the front aisle,
brew for six seconds, and carry a mug back to sip on the couch. The shared station
scheduler in `water-cooler.ts` waits 25–50 seconds initially and 45–90 seconds between
coffee runs. Coffee, water and game visitors are mutually exclusive; work, departures,
parties and reduced motion cancel visits. Brewing shows a coffee stream and steam
(static under reduced motion), and the station is included in departure-route obstacles.

`GameCorner` places an arcade cabinet and a pinball table in the back-left corner beside the lounge; the water cooler stands beside the left sofa, facing the room.
`game-room.ts` sends lounge agents (idle or completed) to play, one player per machine,
first after 12–32 / 18–43 seconds and then 35–80 seconds after each return. Players walk
the side aisle, play for 14–24 seconds with joystick/button or flipper poses synced to the
machine animation (invaders and ship on the arcade screen; ball, bumpers, and flippers on
the table), then return to their couch seat. An agent on a water break is never chosen,
new work cancels the game, and reduced-motion mode suppresses game breaks.

Secret office party: typing `party` (or the Konami code ↑↑↓↓←→←→BA) anywhere outside a form
field makes every lounge agent (idle, or completed after its cheer) stand in front of its
couch seat and run the 14-second merge-party routine with confetti and a "Party time!" label.
Water and game breaks are cancelled for the party. It is client-only (`secret-party.ts`): it
changes no server state and only plays in the browser where it was typed.

Typing `boss` outside a form field sends all currently idle agents sprinting to their
desks to pretend to work: exaggerated keyboard flailing, head bobbing and fast-scrolling
screens with a slow, low-contrast glow. After 15 seconds from the trigger they resume
their usual activities. Typing it again restarts the timer. Completed agents relaxing in
the lounge are included, just like `party`; working agents are not recruited and real work
immediately takes priority. Like `party`, this is browser-only
and changes no provider status. Reduced motion skips the sprint/flailing and screen pulsing,
showing a static working pose instead.

Travel between lounge seats and desks uses a steady walking pace with directional
facing and swinging arms and legs. Agents stay standing during travel and switch to
their seated activity only on arrival; reduced motion places them directly at the destination.
Desk travel uses the furniture visibility graph for normal work, boss-mode sprints,
and home departures. Agents enter and exit the chair from a side access point, never
from across the tabletop. Routes replan when destinations or furniture change and
stop at each corner to avoid clipping through obstacles; only the occupied chair's
final lateral seating segment is allowed through its bounds.

**Send home** in the agent profile starts a server-persisted departure. Shared
`homeTimeline` milestones (seconds from the action) keep clients and cleanup aligned:
walk to the desk by 2.5, shut off the monitor at 4.5, leave with the cup at 5.5,
reach the nearest side boundary of the office by 10.5 and disappear immediately there,
then puff the furniture away and remove the desk at 12.5. Travel is twice the original
send-home pace; shutdown, pickup and smoke durations are unchanged.
`home-route.ts` finds clear routes through expanded furniture corners, accounting for
avatar width and all desks, chairs, sofas, coffee tables, game cabinets and the cooler.
Agents first step forward out of their own seat, then use the aisles rather than
cutting diagonally through furniture. Departure ends at the occupied office boundary,
not the camera edge.
`AgentPresence` faces the route while walking and carries the cup; `Workstation` hides its
cup on pickup, switches off `MonitorScreen`, and renders `DepartureSmoke` at the old desk.
Reduced motion skips walking and uses a static fading smoke cloud.

`POST /api/v1/agents/:id/home` is host-only and idempotent during departure. The server
stores `metadata.homeDeparture.startedAt`, suppresses provider refreshes for dismissed
agents, deletes their desks after the goodbye, and compacts remaining desks. The agent
record, color and history remain stored. Only a working/spawning provider observation
with `lastActivityAt` newer than the dismissal clears it and allocates a new desk;
ordinary polling and stale work do not. New work can interrupt a departure. Startup
sync completes departures that elapsed while the server was stopped.
Local Copilot History and usage attribution include dismissed agents; sending home
never deletes usage records or moves their known usage into the unattributed bucket.

Away agents are out of the office: on a successful provider refresh, their desks are
cleared before new desks are allocated, and remaining desks are compacted.
They are excluded from the office roster, headcount and couch capacity immediately.
Profile color, metadata, usage and activity history remain in SQLite. A later return
allocates an available desk with the saved profile. Parent links are retained, so
returning subagents rejoin their team. Joining and queued agents retain their desks.
The legacy `retainOfflineHours` configuration field remains accepted for compatibility
but no longer delays clearing away desks; its settings control has been removed.

Working avatars sit centered at the keyboard with bent elbows and forearms reaching the
keys. `TypingArms` positions the arm segments between shoulders, elbows, and wrists;
`typing-animation.ts` alternates small key taps in staggered bursts, pauses, and looks
back up at the monitor. Reduced-motion mode keeps hands still above the keys.

`activity-animation.ts` supplies different wrist/head targets for reading a document,
researching with notes, monitoring a running task, delegating, organizing context, and
checking a problem. `getOfficeActivity` gives status precedence over activity metadata,
so idle/attention/terminal agents never remain in a working animation. All activity
poses are static in reduced-motion mode. Desk captions, the accessible list, and the
profile display the activity independently of lifecycle status.

When the **entire unfiltered roster is nonempty and idle**, `JanitorEncounter` schedules a
visitor after 10-25 seconds. The janitor enters, performs for 8 seconds, leaves, and waits
45-90 seconds before another visit. Resuming work cancels a pending visit or sends the
visitor out early. The janitor is scenery, not a provider agent or a roster entry.

The 12 randomly chosen routines are disco dance, moonwalk, slippery-floor tumble (with
recovery), mop air guitar, pirouette, bucket stumble, robot dance, tap shuffle, comic sneeze,
mop baton twirl, victory hops, and dramatic bow. Consecutive routines do not repeat.
Reduced-motion mode shows a stationary quiet visit instead of movement or slapstick.
The frame-loop scheduler uses no background timers and disappears with the scene; hidden
tabs do not accumulate missed encounters. Encounter captions are also exposed to screen readers.
