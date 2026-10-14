# 3D scene extension guide

`OfficeScene` owns the orthographic camera, lights, floor, optional decorations, and workstation layout. `Workstation` is a reusable procedural desk/chair/monitor component. `AgentAvatar` builds a low-poly figure from simple boxes and updates limb/head transforms inside React Three Fiber's frame loop rather than scheduling React state per frame.

The default camera zoom is 50 (reset restores this scale), with manual zoom from 18 to 100. Desk name/status labels use camera-facing billboards and larger text for readability.

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
`AgentPresence` positions the avatar independently of the furniture. Couch avatars have bent
seated legs and deterministic reading, coffee-sipping, or reclining/stretching personalities.
`lounge-animation.ts` generates staggered poses without per-frame React updates. Reduced-motion
mode retains a static relaxed pose, and status changes reset the couch transforms and props.

`WaterCooler` sits beside the lounge. `water-cooler.ts` schedules one idle visitor at
a time after an initial 20–45-second wait, followed by 30–70 seconds between visits.
Agents walk along the front/side lounge aisles at 1.5 world units per second, drink for
five seconds, and return to their reserved couch seat. Each completed return selects
a different reading, sipping, or reclining task. New work immediately cancels the visit.
The scheduler uses the full idle roster and bounded frame time, so filters do not
cancel breaks and hidden tabs do not fast-forward them. Reduced-motion mode suppresses
visits and retains static couch poses. Breaks are visual only and do not modify provider status.

Offline agents are out of the office: their avatars disappear, their desk monitors
dim, and an Away marker remains. Roster/list entries show last-seen time. Desks stay
reserved for the configured **Offline desk retention (hours)**, without extending
the deadline on every refresh. Resuming before expiry restores the same desk.
After expiry, the agent is archived and its desk freed; profile color, metadata and
activity history remain in SQLite. A later return reactivates the profile and allocates
an available desk. Parent links are retained, so returning subagents rejoin their team.

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
