# Roster plan

## WILD-ART: planting-only rare kids and special bodies (2026-10-09)

D-072/D-073 override the ordinary-only shared-potato and costume restrictions below **for rares and specials only**. The original 64 IDs/recipes/body rigs remain exact. This handoff adds ten rare IDs and redesigns all twenty special bodies. Result: **94 art-covered types**, subject to Claude's content import, simulator tiers and review; no additional recipes or Garden/Compendium entries. The ten are planting-only apex types, count in Dex completion, can be planted, and win when both independent rolls succeed. Retired per-type variants do not return.

| rainbow | Rainbow Kid | Six-colour scalloped puff; whole body rainbow, ink seams retain identity in gray. | toast / apple | Pending Claude |
| blimp | Blimp Kid | Long airship hull with two broad tail fins; no gondola or child in a vehicle. | berry_jam / toast | Pending Claude |
| spool | Spool Kid | Broad thread reel with projecting oval end flanges. | berries / corn | Pending Claude |
| paper_fan | Paper Fan Kid | Wide pleated semicircle with stepped upper edge and short folded base. | apple / berries | Pending Claude |
| jelly | Jelly Kid | Tall moulded dessert with broad wavy rim, visibly scalloped dome. | carrot / berry_jam | Pending Claude |
| cushion | Cushion Kid | Plump concave-sided square pillow with four oversized tied corners. | corn / carrot | Pending Claude |
| seashell | Seashell Kid | Asymmetric conch shell with a stepped spire and flared side lip; distinct from the semicircular Paper Fan. | mushroom / pickle | Pending Claude |
| flying_saucer | Flying Saucer Kid | Wide saucer rim under a solid domed hull; face on hull, no glass cockpit. | pickle / cheese | Pending Claude |
| ring_planet | Ring Planet Kid | Round globe with a broad oblique rear ring, exposed on both sides without crossing the face. | cheese / mushroom | Pending Claude |
| wind_up_key | Wind-Up Key Kid | Butterfly winding bow with two open finger holes above the face and a long smooth shaft with a blunt end. | soup / cocoa | Pending Claude |

Every rare has a complete record in `art/data/personality_v1.json` (description, likes, hates, hobbies, favouriteFood and hatedFood). All **94 ordered food pairs are distinct**; the original 84 records are unchanged. All ten rare tiers are **null placeholders owned by Claude**, not zero or tentative balance choices. D-066's special names/IDs/12 T5 + 8 T6 tiers and personality prose are retained exactly.

All thirty wild types use the additive `kid_wild_v1.json` contract and one cropped body frame, with unchanged shared D-045 faces. Per-type lifetime boxes use the existing axis-aligned collision rules, not an enlarged universal potato reserve. Bob/closed-eye/static object substitutes cover unsupported walk/wave/sit clips without added anatomy. Full contract and explicit renderer handoff: [notes](../.codex-out/wild-art-notes.md). [Native review gallery](../art/previews/wild/index.html) includes each among ordinary T1–T4 kids, the full roster, Dex rows and cards in colour/grayscale. Original costume and concept sections below are historical where superseded; this delivery does not claim Claude's review or gate-4 owner acceptance.


ChatGPT proposal for ROSTER-PLAN, 2026-10-02. Claude reviews IDs, validation and balance. **64 MVP types / 58 recipes / tiers 1–5; 500-type long-term allocation / tiers 1–8.** Existing 16 IDs, names, tiers and all 12 recipes are retained. This PR supplies planning data only. It does not approve balance, supply art, or mark the joint task done before Claude's review.

Authority: D-038, D-044–D-047, design-doc.md and ENGINEERING_PLAN.md §§2–3 / Roster scale. Recipes stay hidden until found, unordered, consume two to make one, and strictly increase tier. Family membership is an editorial aid; it adds no gameplay categories, maps, affinity bonuses, unlocks or buildings.

## Structure toward 500

Go wider before deeper. Freeze the six tier-1 seeds and ten tier-2 results in this proposal, then grow the families through tiers 3–8. A family can start from several existing ingredients and meet other families through concrete objects: glass + growing -> enclosed garden; clay + drink -> vessel; wind + grain -> mill. No automatic family-combination rule exists. Every later pairing needs its own thematic note and a free unordered pair.

Counts include the MVP. Rows are distinct costume/Dex slots, never body/face/size variants. These are allocation targets, not 436 approved names or a finished 500-entry content file. At least one incoming recipe is budgeted for each non-spawn slot. Final recipe graphs must be validated per wave against all previously shipped content.

| Family / world | T1 | T2 | T3 | T4 | T5 | T6 | T7 | T8 | Total | MVP | Costume territory |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |
| Core & Elements | 6 | 0 | 2 | 2 | 2 | 3 | 3 | 2 | 20 | 6 | Material costumes: pebble, paper, magnet, bubble; shape, not a differently coloured bare potato. |
| Weather & Sky | 0 | 2 | 3 | 8 | 12 | 12 | 8 | 5 | 50 | 5 | Steam, rain, frost, wind instruments and sky light; no weather particle systems. |
| Kitchen & Table | 0 | 1 | 5 | 10 | 16 | 16 | 10 | 7 | 65 | 10 | Cooking tools, baked shapes, drinks and tableware; avoid dozens of identical bowl rims. |
| Garden & Growing | 0 | 1 | 5 | 10 | 16 | 16 | 10 | 7 | 65 | 11 | Leaves, flowers, pruning, trellises and tiny garden containers; no plant limbs. |
| Craft & Workshop | 0 | 2 | 5 | 9 | 13 | 15 | 10 | 6 | 60 | 11 | Clay, glass, timber, textile and metal tools; distinguish crafts through the main tool. |
| Rescue & Care | 0 | 1 | 2 | 5 | 8 | 9 | 6 | 4 | 35 | 4 | Rescue and helping equipment, lanterns, shelters and first-aid bags; no medical mechanics. |
| Waterside & Voyages | 0 | 1 | 3 | 7 | 10 | 11 | 8 | 5 | 45 | 5 | Sails, navigation, docks and boats represented by wearable props; no travel system. |
| Play & Festival | 0 | 1 | 2 | 8 | 12 | 14 | 11 | 7 | 55 | 5 | Kites, toys, music tools, fairground shapes and paper decorations. |
| Cozy & Seasons | 0 | 1 | 1 | 7 | 10 | 12 | 10 | 9 | 50 | 5 | Picnics, knitted objects, lamps and winter stalls; permanent recipes, no event timers. |
| Curiosity & Science | 0 | 0 | 2 | 8 | 11 | 12 | 14 | 8 | 55 | 2 | Crystals, lenses, measuring tools and observation; no new research system. |
| **Total** | **6** | **10** | **30** | **74** | **110** | **120** | **90** | **60** | **500** | **64** | |

**Cross-family bridges and later design lanes:**

| Families | MVP bridge | Later objects to explore (not reserved IDs) |
| --- | --- | --- |
| Core -> all | Heat, water, cold, wind and stone enter early crafts | Paper fold, bubble cage, magnet yoke, sand scoop; each must earn a distinct outline |
| Kitchen + Garden | Sundae + Gardener -> Picnic; Mushroom + Chef -> Soup | Herb grinder, seed loaf, preserve funnel, orchard press |
| Garden + Craft | Gardener + Glassblower -> Greenhouse | Irrigation wheel, woven planter, espalier frame, grafting tool |
| Craft + Kitchen | Tea + Potter -> Teapot; Weather Vane + Baker -> Windmill | Cookie cutter, rolling pin, bread tin, ceramic serving tower |
| Weather + Craft | Pinwheel + Blacksmith -> Weather Vane | Barometer dial, frost stencil, rain gauge, wind chime |
| Rescue + Waterside | Hero + Captain -> Lifeguard | Rescue reel, signal paddle, search lamp, rope ladder pack |
| Waterside + Play | Sail + Plain -> Captain; Captain + Fire -> Balloon | Model glider, paddle toy, paper boat, kite ferry prop |
| Cozy + Play | Picnic + Lantern -> Festival | Paper garland, music box, blanket roll, ticket punch |
| Science + Craft / Garden | Kiln + Crystal -> Mosaic; Greenhouse + Crystal -> Observatory | Prism frame, magnifier, survey tripod, armillary ring |
| Garden + Cozy / Weather | Lantern + Terrarium -> Moon Garden | Dew collector, seed lantern, pressed-flower frame, sheltered planter |

The high-tier entries remain tiny costumes, even when the name describes a place. A botanical garden is a trellis; a harbor is an anchor; a fair is a little wheel. Do not turn a potato into a new body, building, animal or diorama. No national costumes, ethnic shorthand, religious dress as a joke, noses on snow costumes, costume faces or added limbs.

## Content waves after gate 4

Suggested editorial order, subject to Claude's economy/art throughput review and the owner's gate-4 approval. Each wave fills the named family's remaining cells in the matrix. A release may split a wave. Low-tier bridges ship before their dependants; cross-family parents must already exist or ship earlier in the same release. Recipes and costumes are reviewed together before IDs become permanent. Seasons are permanent collection themes, not time-limited availability.

| Wave | Lead family | New types | Cumulative types |
| --- | --- | ---: | ---: |
| 1 | Kitchen & Table | 55 | 119 |
| 2 | Garden & Growing | 54 | 173 |
| 3 | Craft & Workshop | 49 | 222 |
| 4 | Weather & Sky | 45 | 267 |
| 5 | Waterside & Voyages | 40 | 307 |
| 6 | Play & Festival | 50 | 357 |
| 7 | Cozy & Seasons | 45 | 402 |
| 8 | Rescue & Care | 31 | 433 |
| 9 | Curiosity & Science | 53 | 486 |
| 10 | Core & Elements | 14 | 500 |

Per-wave checklist: reserve distinct primary cues against the entire shipped grayscale roster; choose 1–3 components and one accent family; hand-design at least one source per slot; avoid occupying a pair already used; retain all shipped IDs/recipes/tiers; run full reachability/tier/pair checks; check acquisition costs and compendium prices with Claude; require art only for the shipped set; measure loading, Dex-page memory and APK growth under ROSTER-SCALE. No future slot ships merely because a structural witness validates.

## Spawn pool and economy proposal

Six tier-1 types spawn from day one: Plain **30**, Fire **16**, Water **16**, Snow **16**, Wind **12**, Stone **10** (relative weights, sum 100). These weights are suggestions for Claude, not a balance decision. The existing four remain in the pool. The Bias building can target any of these six through the existing multiplier; Compendium re-acquires discovered parents through the existing fee. No unlockable spawn types or new building is required for 500.

Plain stays most common and helps orient the first few discoveries. Wind opens travel/toys/weather, Stone opens craft, and neither needs extra facial features. All six have at least two direct recipe uses; Stone has the fewest and starts at the lowest weight. With more seed types, specific seed pairs become less frequent: Plain+Water falls from 16% to 9.6% of independent, unordered two-draw samples. Across all starting recipes, the weighted chance for two independent Garden draws is 63.12%, versus 64% currently: frequently drawn Plain makes this greater than the unweighted pair density. These calculations are not a contact/time-to-discovery simulation. Claude should measure first-playable discovery time, time to tier 5, incidental consumption and map starvation before accepting the weights or 12-second spawn interval. Keep the first-playable/tutorial opportunity under engineering's control; this proposal does not add a guaranteed-spawn rule.

At tiers 1–5 income is 0.5/1/2/4/8 Materials per second per kid. Tier 8 is 64/s, 128 times tier 1. We need no tier 9 or curve change. Prefer adjacent top-parent tiers in new recipes so a single lucky low-tier pairing never jumps straight into high income. All MVP recipes follow that rule. Equal-tier parents conserve their combined income; mixed-tier parents can raise it, so Claude must include both in the simulator. Acquisition depth is not a rarity multiplier; many late entries share the same tier/earning power.

## Art contract and silhouette review

All additions use the approved shared body/face/pose rig and **1–3 components**, independent of body choice and pose. Plain is the existing zero-costume exception. Slots below are head_top, torso, hand_right and back; back means a rear-layer component following an existing head_top/torso attachment, not a request for a new rig joint. The existing Water hood keeps its approved face_centre attachment. Do not rewrite the final 16 costumes to force a planning shorthand. All components must fit the current lifetime bounds/padding and leave the two dot eyes and smirk clear. No per-body/per-pose art or new animation clips.

The references' cook, snow and sleep drawings and the current types-20x9.png and types-20x9-gray.png were inspected. Existing silhouette anchors remain: flame, droplet, pom beanie, toque, rescue helmet, top hat, twin vapour curls, cape/medal, dessert bowl/cherry, leaves, straw brim, cloud, blowpipe, lantern and kerchief. Costume concepts below reserve different primary shapes; accent colour alone never distinguishes a type.

Planning collision review: Tea's wide single-handled cup vs Cocoa's tall squared mug; Sundae's shallow bowl vs Soup's deep handled pot/ladle; Stone's flat pebble vs Crystal's three sharp peaks; Steam's thin curls vs Raincloud's separate lobes vs Blizzard's six-point flake; Sprout's two leaves vs Flower's five petals vs Cactus's three blunt pads vs Bonsai's two flat shelves; Greenhouse's pitched roof vs Terrarium's tall bell jar vs Snowglobe's round pedestal globe; Kite's diamond vs Sail's triangle vs Balloon's pear vs Sky Fair's gondola wheel; Pinwheel's three triangles vs Windmill's four separate panels on a tapered tower vs Captain's small open spokes. Keep Observatory's tube as its main cue, rather than relying on another dome. Wind's sock must not resemble Snow's beanie. Builder keeps the upright brick as its primary cue and uses a torso tool belt as its secondary; its head stays bare so Firefighter retains the raised-shield helmet silhouette. Kiln's square shoulders and bottom-open arch must differ from Greenhouse's pitched roof frame. Rescue Station's hooked ladder has two rails and open rungs rather than Hero's broad cape or Botanical Garden's square lattice/leaf frame.

### Low head cap cluster

Nine of the 48 new costumes place compact caps on head_top. ASSET-MVP must compare these together in grayscale with secondary props hidden, using the following outline targets. Height differences are relative within the current art envelope; no larger lifetime bounds are requested. A notch or opening must reach the contour or remain visibly open against the shared body at game size, rather than becoming a painted dark detail.

| Kid / ID | Outline target and separation |
| --- | --- |
| Stone / `stone` | Thinnest cap: a skewed slab with blunt uneven ends, almost no rise, no projecting brim and no regular cutout. Lower and less symmetric than Mushroom. |
| Mushroom / `mushroom` | A symmetric shallow dome, visibly higher than Stone, with wide rounded overhangs on both sides and a lifted underside. One continuous convex top, unlike Pretzel's tilted crossed rope and unequal lobes. |
| Cookie / `cookie` | A tilted near-circle, higher relative to its width than Mushroom, with one large bite cut from the upper-right outer edge. The missing arc must survive reduction; no reliance on chocolate dots. |
| Pretzel / `pretzel` | Tilted crossed dough rope: one large upper-left opening, a lower smaller right lobe and a rising diagonal twist crossing the middle. Unequal heights and crossing ends must survive at game size; never two equal side-by-side lens loops. The single dominant open lobe differs from Cookie's bitten solid disk. |
| Kiln / `kiln` | Square shoulders and a flat top ledge over a broad semicircular cutout open at the bottom. Thick arch legs flank the opening; no mushroom-like continuous dome or merely painted firing door. |
| Forge / `forge` | A nearly horizontal top with a long tapered right horn, short squared left heel and a pinched waist below. Strong one-sided overhang and underside steps, unlike Kiln's centered arch. |
| Mosaic / `mosaic` | An angular L: one taller left block drops through a single broad rectangular top step into a lower right arm. Square ends, no curves, tapered horn or narrow anvil waist. |
| Moon Garden / `moon_garden` | A tilted crescent with two unequal pointed tips and a deep side-open concavity. A single curved spine, unlike Pretzel's crossed knot or Cookie's small bite. |
| Winter Market / `winter_market` | A very shallow straight-topped awning with square overhangs at both ends and three broad scallops along the lower edge. Repeated lower lobes distinguish it from Mushroom's smooth underside and Kiln's single opening. |

Also compare this cluster with existing Firefighter, Gardener, Snowman and Picnic headwear and the other proposed caps, especially Greenhouse, Captain and Observatory. These are targets for drawing and review, not evidence that the finished silhouettes pass.

**Art production status (2026-10-02): all 64 planned kids have costume art after ASSET-MVP batch 3. The 12 tier-5 kids and Aurora/Terrarium follow-ups are final for Claude review; in-engine/device recognition remains an acceptance check.** In ASSET-MVP, inspect each at ~55 CSS px in colour and grayscale alongside all prior types, then on every body/face/pose. Redraw a colliding primary cue before exporting; do not solve it by colour, extra face details, a new physique or many miniature symbols. A paper object may reuse construction methods but each Dex costume must have a distinct visible silhouette. Keep cues compact inside existing bounds, especially all rear wheel/trellis/sail designs.


Batch-3 drawing review keeps the Mosaic L, Moon Garden deep crescent and Winter Market three-scallop outline targets. The crescent's lower point and awning scallops are raised clear of the crown; the trellis, fair wheel and mill sails sit left so their primary outline is visible, while Rescue Station's hooked ladder projects beside the left shoulder and hip. Cake gets a visible square-ended unlit candle and flat tier sides. Aurora deliberately leaves the thin curtain/shaft form for a broad lobed light sheet; Terrarium loses its lid/tab and angular shoulders for a continuous tall dome to separate it from Lantern. No gameplay/content/rig/envelope change. Current comparison sheets and per-kid everyday-object checks: .codex-out/asset-mvp-3-notes.md.

## MVP roster

The 16 current types retain names and IDs. New IDs are lowercase snake_case proposals for Claude's review; only accepted shipped IDs become permanent. Family and costume text are planning metadata and do not enter kids.json. Sources below name exactly one recipe each; recipe numbers are doc references, not content IDs.

| ID | Tier | Display name | Family | Costume: primary silhouette; accent; slots/components | Source |
| --- | ---: | --- | --- | --- | --- |
| `plain` | 1 | Potato Kid | Core & Elements | Bare approved potato contour; cream; 0 components (shared body/face only). | Spawn 30% |
| `fire` | 1 | Fire Kid | Core & Elements | Asymmetric flame crest; orange; head_top crest + back flame (2, existing). | Spawn 16% |
| `water` | 1 | Water Kid | Core & Elements | Open pointed droplet hood; muted blue; existing face_centre hood (1, retained attachment). | Spawn 16% |
| `snow` | 1 | Snow Kid | Core & Elements | Tall pom beanie; ice blue; head_top beanie + torso scarf (2, existing). | Spawn 16% |
| `wind` | 1 | Wind Kid | Core & Elements | Single broad windsock cap with short bent tail; pale mint; head_top windsock (1). | Spawn 12% |
| `stone` | 1 | Stone Kid | Core & Elements | Very thin skewed pebble slab with blunt uneven ends and no brim; slate; head_top pebble (1). | Spawn 10% |
| `chef` | 2 | Chef Kid | Kitchen & Table | Puffed toque; warm cream; head_top hat + hand_right pan (2, existing). | R02: `plain + fire` |
| `firefighter` | 2 | Firefighter Kid | Rescue & Care | Raised-shield helmet; brick red; head_top helmet + hand_right nozzle + back hose (3, existing). | R01: `plain + water` |
| `snowman` | 2 | Snowman Kid | Cozy & Seasons | Flat black top hat; ice blue; back hat at head_top + torso lower snow suit/buttons (2, existing). | R03: `plain + snow` |
| `steam` | 2 | Steam Kid | Weather & Sky | Two unequal curling vapour strokes; pale sage; head_top vapour (1, existing). | R04: `fire + water` |
| `sprout` | 2 | Sprout Kid | Garden & Growing | Two unequal leaves; leaf green; head_top leaves + torso seed bib (2, existing). | R07: `water + snow` |
| `sail` | 2 | Sail Kid | Waterside & Voyages | Compact triangular sail on a short mast; sail blue; back sail + torso rope sash (2). | R13: `wind + water` |
| `blizzard` | 2 | Blizzard Kid | Weather & Sky | One broad six-point snowflake cap; ice blue; head_top snowflake + torso short muffler (2). | R14: `wind + snow` |
| `builder` | 2 | Builder Kid | Craft & Workshop | One chunky rectangular brick held upright; clay orange; hand_right brick + torso tool belt (2). | R15: `plain + stone` |
| `forge` | 2 | Forge Kid | Craft & Workshop | Squat flat-topped anvil cap with a long tapered right horn, short left heel and narrow waist; iron gray; head_top anvil + torso ember apron (2). | R16: `fire + stone` |
| `kite` | 2 | Kite Kid | Play & Festival | Tilted diamond kite with one short bow tail; coral; back kite + hand_right spool (2). | R17: `plain + wind` |
| `hero` | 3 | Hero Kid | Rescue & Care | Flared short cape and broad diamond medal; rescue red; back cape + torso medal (2, existing). | R05: `fire + firefighter` |
| `sundae` | 3 | Sundae Kid | Kitchen & Table | Shallow dessert bowl and cherry; cherry red; back bowl + head_top cherry + torso rim/cup (3, existing). | R06: `chef + snowman` |
| `gardener` | 3 | Gardener Kid | Garden & Growing | Crooked broad straw brim; leaf green; head_top hat + torso apron + hand_right trowel (3, existing). | R08: `plain + sprout` |
| `raincloud` | 3 | Raincloud Kid | Weather & Sky | Low detached unequal cloud lobes; muted sage; back cloud + head_top drops (2, existing). | R09: `water + steam` |
| `glassblower` | 3 | Glassblower Kid | Craft & Workshop | Diagonal pipe with amber bulb; amber; head_top raised goggles + hand_right pipe (2, existing). | R10: `fire + steam` |
| `baker` | 3 | Baker Kid | Kitchen & Table | Long flat bread paddle with one loaf; wheat gold; hand_right paddle/loaf + torso apron (2). | R18: `chef + fire` |
| `tea` | 3 | Tea Kid | Kitchen & Table | Wide tea cup with one side handle; tea green; torso cup wrap + head_top folded tea-tag cap (2). | R19: `chef + steam` |
| `cocoa` | 3 | Cocoa Kid | Kitchen & Table | Tall mug with squared handle and marshmallow block; cocoa brown; torso mug + head_top marshmallow (2). | R20: `chef + snow` |
| `flower` | 3 | Flower Kid | Garden & Growing | Single five-petal offset blossom; dusty rose; head_top blossom + torso leaf collar (2). | R21: `sprout + water` |
| `cactus` | 3 | Cactus Kid | Garden & Growing | Three blunt upright cactus pads; sage; head_top connected cactus cap + torso clay-pot belt (2). | R22: `sprout + fire` |
| `mushroom` | 3 | Mushroom Kid | Garden & Growing | Wide symmetric shallow dome with two rounded overhangs and a lifted underside; ochre; head_top cap + torso short gardening bib (2). | R23: `sprout + snow` |
| `potter` | 3 | Potter Kid | Craft & Workshop | Wide-mouth clay jug with one open handle; terracotta; hand_right jug + torso clay apron (2). | R24: `builder + water` |
| `crystal` | 3 | Crystal Kid | Curiosity & Science | Three unequal sharp crystal peaks; lilac; head_top crystal cluster (1). | R25: `forge + snow` |
| `blacksmith` | 3 | Blacksmith Kid | Craft & Workshop | Broad block hammer; iron gray; hand_right hammer + torso leather apron (2). | R26: `forge + plain` |
| `lighthouse` | 3 | Lighthouse Kid | Waterside & Voyages | Narrow striped beacon cap with flared light hood; sea blue; head_top beacon + torso striped bib (2). | R27: `sail + fire` |
| `captain` | 3 | Captain Kid | Waterside & Voyages | Compact eight-spoke ship wheel; navy; hand_right wheel + head_top low peaked cap (2). | R28: `sail + plain` |
| `whistle` | 3 | Whistle Kid | Craft & Workshop | Short twin steam-whistle pipes of unequal height; brass; head_top pipes + torso valve badge (2). | R29: `steam + wind` |
| `pinwheel` | 3 | Pinwheel Kid | Play & Festival | Three folded triangular blades on a short stem; coral; hand_right pinwheel + torso paper sash (2). | R30: `kite + wind` |
| `lantern` | 4 | Lantern Kid | Cozy & Seasons | Small looped lantern cap; amber; head_top cap + torso star + back flat glow (3, existing). | R11: `hero + glassblower` |
| `picnic` | 4 | Picnic Kid | Cozy & Seasons | Side-knotted checked kerchief; picnic red; head_top kerchief + torso bib + hand_right basket (3, existing). | R12: `sundae + gardener` |
| `greenhouse` | 4 | Greenhouse Kid | Garden & Growing | Low pitched glass roof with square frame; sage; head_top roof + torso seed-tray bib (2). | R31: `gardener + glassblower` |
| `bouquet` | 4 | Bouquet Kid | Garden & Growing | Broad hand-held fan of three flower heads; dusty rose; hand_right bouquet + torso tied paper wrap (2). | R32: `flower + gardener` |
| `bonsai` | 4 | Bonsai Kid | Garden & Growing | Two flat offset foliage shelves on a bent trunk; leaf green; head_top tree + torso shallow tray (2). | R33: `gardener + sprout` |
| `terrarium` | 4 | Terrarium Kid | Garden & Growing | Narrow tall continuous domed glass cloche offset to the left crown, with visible moss/mushroom and no lid, lifting tab, loop or square shoulders; moss green; head_top glass garden + torso mushroom label (2). | R34: `mushroom + glassblower` |
| `teapot` | 4 | Teapot Kid | Kitchen & Table | Low lid cap and short upright hollow-ended left spout, bare belly; tea green; head_top lid + torso side spout + back loop handle (3). | R35: `tea + potter` |
| `cookie` | 4 | Cookie Kid | Kitchen & Table | Tilted near-round cookie cap with one large upper-right bite notch; cocoa brown; head_top cookie + torso crumb-pocket bib (2). | R36: `baker + cocoa` |
| `pretzel` | 4 | Pretzel Kid | Kitchen & Table | Tilted crossed-rope pretzel cap with one dominant upper-left dough loop, smaller lower-right loop and a diagonal rising twist; wheat gold; head_top pretzel + torso baker ribbon (2). | R37: `baker + blacksmith` |
| `soup` | 4 | Soup Kid | Kitchen & Table | Deep twin-handled side pot with a hooked ladle ending in a low open scoop; ochre; torso pot + hand_right ladle (2). | R38: `mushroom + chef` |
| `snowglobe` | 4 | Snowglobe Kid | Cozy & Seasons | Round open globe frame on a stepped pedestal; ice blue; back globe + torso pedestal/snow scene (2). | R39: `blizzard + glassblower` |
| `ice_sculptor` | 4 | Ice Sculptor Kid | Craft & Workshop | Solid beveled ice block with a scooped carving notch and diagonal steel chisel, no board; ice blue; hand_right carved ice/chisel + torso chisel holster (2). | R40: `snowman + potter` |
| `weather_vane` | 4 | Weather Vane Kid | Weather & Sky | Single horizontal arrow above a short post; brass; head_top arrow/post + torso compass badge (2). | R41: `pinwheel + blacksmith` |
| `balloon` | 4 | Balloon Kid | Play & Festival | Small pear-shaped balloon on two short tethers; coral; back balloon + torso basket wrap (2). | R42: `captain + fire` |
| `steamboat` | 4 | Steamboat Kid | Waterside & Voyages | Small cabin boat with a paddle wheel carried at the right hip, plus one flat funnel cap; navy; torso side boat/wheel + head_top funnel (2). | R43: `captain + whistle` |
| `lifeguard` | 4 | Lifeguard Kid | Rescue & Care | Large open lifebuoy belt; rescue red; torso buoy + hand_right rescue float (2). | R44: `hero + captain` |
| `kiln` | 4 | Kiln Kid | Craft & Workshop | Low brick arch cap with square shoulders, a flat top ledge and a broad bottom-open arch cutout; clay orange; head_top kiln arch + hand_right tile (2). | R45: `potter + forge` |
| `aurora` | 4 | Aurora Kid | Weather & Sky | Broad softly lobed flowing light sheet above and along the left crown, with pale folded bands and no shaft/crossbar; lilac; back light sheet + torso flat hem light-pattern tab (2). | R46: `blizzard + crystal` |
| `festival` | 5 | Festival Kid | Play & Festival | Short crown of three triangular pennants; coral; head_top bunting + hand_right little drum (2). | R47: `picnic + lantern` |
| `observatory` | 5 | Observatory Kid | Curiosity & Science | Large tilted short telescope tube on a compact stand; navy; hand_right telescope + head_top low slit-dome cap (2). | R48: `greenhouse + crystal` |
| `botanical_garden` | 5 | Botanical Garden Kid | Garden & Growing | Squared trellis arch offset to the left, with exposed dark-edged lattice and two broad leaf tabs; leaf green; back trellis + hand_right seed tray (2). | R49: `bonsai + greenhouse` |
| `moon_garden` | 5 | Moon Garden Kid | Garden & Growing | One tilted thin-spined crescent cap with unequal pointed tips and a deep side-open concavity, both tips exposed above the crown; lilac; head_top crescent + hand_right mushroom lamp (2). | R50: `lantern + terrarium` |
| `patisserie` | 5 | Patisserie Kid | Kitchen & Table | Three diminishing flat-sided cake tiers with a square-ended short unlit candle; dusty rose; head_top cake + hand_right piping bag (2). | R51: `cookie + teapot` |
| `winter_market` | 5 | Winter Market Kid | Cozy & Seasons | Very shallow straight-topped stall awning cap with square end overhangs and three broad lower scallops; ice blue; head_top awning + torso cocoa sachet apron (2). | R52: `cocoa + snowglobe` |
| `harbor` | 5 | Harbor Kid | Waterside & Voyages | Broad curved anchor with two flukes; sea blue; hand_right anchor + back paired mooring posts (2). | R53: `lighthouse + steamboat` |
| `sky_fair` | 5 | Sky Fair Kid | Play & Festival | Left-offset continuous fair wheel with five upright hanging box cabins and five angled spokes; coral; back wheel + torso ticket sash (2). | R54: `balloon + pinwheel` |
| `rescue_station` | 5 | Rescue Station Kid | Rescue & Care | Tall hooked rescue ladder with two rails and five open rungs beside the left shoulder and hip; rescue red accent on retained torch; back ladder (retained stretcher ID) + hand_right rescue torch (2). | R55: `lifeguard + lantern` |
| `sculpture_park` | 5 | Sculpture Park Kid | Craft & Workshop | One solid carved spiral sculpture on a stepped base; ice blue; head_top spiral + torso plinth belt (2). | R56: `ice_sculptor + aurora` |
| `windmill` | 5 | Windmill Kid | Craft & Workshop | Tapered miniature mill tower with a pitched cap, doorway and four separate sail panels on thin spars; wheat gold; back tower/sails (retained sails ID) + hand_right grain bag (2). | R57: `weather_vane + baker` |
| `mosaic` | 5 | Mosaic Kid | Craft & Workshop | Stepped L-shaped tile cap with one tall left block, a broad rectangular top step and square ends; terracotta; head_top tessera cap + torso tiled apron (2). | R58: `kiln + crystal` |

## MVP recipes

R01–R12 are retained unchanged from the current content. Most rationales use familiar objects; the legacy Fire+Steam glass craft and a few capstones are playful associations, not claims about physical processes. Recipes are authoring information here; undiscovered ones stay hidden in the game.

**Self-pairs are allowed by the data contract and counted in density denominators, but this MVP uses none.** Reserve self-pair recipes for a later clear thematic case; this plan does not silently turn doubling any kid into a merge rule. Reverse-order rows are never added. There is one source per non-spawn kid and no alternate recipes in this MVP.

| # | Unordered pair -> result | Result tier | Why it makes sense |
| --- | --- | ---: | --- |
| R01 | `plain + water -> firefighter` | 2 | A plain kid equips water to help put out fires; retained first-playable rule. |
| R02 | `plain + fire -> chef` | 2 | A plain kid puts heat to work cooking. |
| R03 | `plain + snow -> snowman` | 2 | A plain kid dresses up in snow. |
| R04 | `fire + water -> steam` | 2 | Heat turns water into steam. |
| R05 | `fire + firefighter -> hero` | 3 | A firefighter facing fire earns a rescue medal. |
| R06 | `chef + snowman -> sundae` | 3 | Cooking meets frozen snow: a cold dessert. |
| R07 | `water + snow -> sprout` | 2 | Thaw water feeds a new shoot. |
| R08 | `plain + sprout -> gardener` | 3 | A plain kid takes care of a sprout. |
| R09 | `water + steam -> raincloud` | 3 | Water vapour gathers into a rain cloud. |
| R10 | `fire + steam -> glassblower` | 3 | Heat plus blowing vapour suggests the hot glass craft; retained legacy association. |
| R11 | `hero + glassblower -> lantern` | 4 | A glassworker makes the hero a rescue light. |
| R12 | `sundae + gardener -> picnic` | 4 | A garden outing with a cold dessert. |
| R13 | `wind + water -> sail` | 2 | Wind over water drives a sail. |
| R14 | `wind + snow -> blizzard` | 2 | Wind blows snow into a storm. |
| R15 | `plain + stone -> builder` | 2 | A plain kid stacks stone into building blocks. |
| R16 | `fire + stone -> forge` | 2 | Heating mineral material starts a forge. |
| R17 | `plain + wind -> kite` | 2 | A plain kid makes a toy to catch the wind. |
| R18 | `chef + fire -> baker` | 3 | The cook gives dough oven heat. |
| R19 | `chef + steam -> tea` | 3 | The cook prepares a steaming drink. |
| R20 | `chef + snow -> cocoa` | 3 | A cook supplies a warm mug for a snowy day. |
| R21 | `sprout + water -> flower` | 3 | Water helps a shoot bloom. |
| R22 | `sprout + fire -> cactus` | 3 | A growing plant adapts to hot conditions. |
| R23 | `sprout + snow -> mushroom` | 3 | The thawed garden has cool damp ground for mushrooms. |
| R24 | `builder + water -> potter` | 3 | Building earth mixed with water becomes workable clay. |
| R25 | `forge + snow -> crystal` | 3 | Cooling heated mineral material suggests crystallisation. |
| R26 | `forge + plain -> blacksmith` | 3 | A plain kid learns to work at the forge. |
| R27 | `sail + fire -> lighthouse` | 3 | A light guides a sail home. |
| R28 | `sail + plain -> captain` | 3 | A plain kid takes the helm. |
| R29 | `steam + wind -> whistle` | 3 | Vapour blown through a pipe whistles. |
| R30 | `kite + wind -> pinwheel` | 3 | A wind toy becomes a spinning wind toy. |
| R31 | `gardener + glassblower -> greenhouse` | 4 | Glass shelters the gardener's plants. |
| R32 | `flower + gardener -> bouquet` | 4 | The gardener gathers flowers. |
| R33 | `gardener + sprout -> bonsai` | 4 | The gardener trains a young shoot into a tiny potted tree. |
| R34 | `mushroom + glassblower -> terrarium` | 4 | Glass encloses a little damp mushroom garden. |
| R35 | `tea + potter -> teapot` | 4 | A clay worker makes the tea vessel. |
| R36 | `baker + cocoa -> cookie` | 4 | The baker adds cocoa to a biscuit. |
| R37 | `baker + blacksmith -> pretzel` | 4 | The baker borrows the metalworker's bent-loop shape for dough. |
| R38 | `mushroom + chef -> soup` | 4 | The cook makes mushroom soup. |
| R39 | `blizzard + glassblower -> snowglobe` | 4 | The glassworker bottles a snowstorm. |
| R40 | `snowman + potter -> ice_sculptor` | 4 | A sculptor's shaping craft meets snow. |
| R41 | `pinwheel + blacksmith -> weather_vane` | 4 | A metalworker makes the wind toy into a direction arrow. |
| R42 | `captain + fire -> balloon` | 4 | The captain pilots a craft lifted by heated air. |
| R43 | `captain + whistle -> steamboat` | 4 | The captain gets a steam-powered boat and its whistle. |
| R44 | `hero + captain -> lifeguard` | 4 | Rescue work moves to the waterfront. |
| R45 | `potter + forge -> kiln` | 4 | The clay worker needs a firing oven. |
| R46 | `blizzard + crystal -> aurora` | 4 | An icy sky plus sparkling crystal suggests northern lights. |
| R47 | `picnic + lantern -> festival` | 5 | Add evening lights to a shared outdoor meal. |
| R48 | `greenhouse + crystal -> observatory` | 5 | A glass shelter and an optical crystal suggest a telescope under a dome. |
| R49 | `bonsai + greenhouse -> botanical_garden` | 5 | A tended collection of plants gets a glass garden. |
| R50 | `lantern + terrarium -> moon_garden` | 5 | A little enclosed garden gets an evening light. |
| R51 | `cookie + teapot -> patisserie` | 5 | Baked treats and tea become a pastry counter. |
| R52 | `cocoa + snowglobe -> winter_market` | 5 | Hot cocoa and a snowy scene suggest a winter stall. |
| R53 | `lighthouse + steamboat -> harbor` | 5 | A boat and its guiding beacon need a home dock. |
| R54 | `balloon + pinwheel -> sky_fair` | 5 | A balloon ride and spinning toy suggest a fairground wheel. |
| R55 | `lifeguard + lantern -> rescue_station` | 5 | The waterfront rescuer gets a lighted base of operations. |
| R56 | `ice_sculptor + aurora -> sculpture_park` | 5 | Cold sculptures displayed under sky lights become an outdoor exhibit. |
| R57 | `weather_vane + baker -> windmill` | 5 | Wind direction plus the baker's grain suggests a flour mill. |
| R58 | `kiln + crystal -> mosaic` | 5 | Fired clay and mineral glazes become coloured mosaic tiles. |

## Graph statistics

Density convention: unordered pairs include self-pairs, so P(n)=n(n+1)/2. For tier t>=2, the **parent band** includes pairs whose highest parent tier is t−1: P(N<t)−P(N<t−1). Count recipes in that band independently of result tier; in this graph every result is exactly one tier above its highest parent, so the band's count equals incoming recipes for tier t. The all-lower denominator P(N<t) is also shown to avoid confusing those two measures. These are type-space densities, not contact probabilities weighted by population.

| Tier | Kids | Incoming recipes | Parent-band density | Recipes / all possible lower-tier pairs | Income per kid / s |
| --- | ---: | ---: | --- | --- | ---: |
| 1 | 6 | 0 | — | — | 0.5 |
| 2 | 10 | 10 | 10/21 (47.62%) | 10/21 (47.62%) | 1.0 |
| 3 | 18 | 18 | 18/115 (15.65%) | 18/136 (13.24%) | 2.0 |
| 4 | 18 | 18 | 18/459 (3.92%) | 18/595 (3.03%) | 4.0 |
| 5 | 12 | 12 | 12/783 (1.53%) | 12/1378 (0.87%) | 8.0 |

Overall: **58/2080 = 2.79%** including self-pairs; **58/2016 = 2.88%** for distinct-type pairs. Tier-1 pairs have **10/21 = 47.62%** recipes (10/15 = 66.67% if self-pairs are excluded). The actual current 16-type content has five tier-1 recipes, including Water+Snow: 5/10 = 50%, rather than the older starter table's 4/10. We propose ten of 21, so most starting type-pairs including self-pairs still do nothing; later parent bands are much sparser. Tier-5 kids are terminals in the MVP; pairing them produces no further kid until later content.

**Longest dependency chain: four fusion edges**, e.g. Plain+Water -> Firefighter; Fire+Firefighter -> Hero; Hero+Glassblower -> Lantern; Picnic+Lantern -> Festival. Both branches still have to be built and each consumed parent re-acquired. Minimum spawn-leaf costs for tier-5 entries range **7–13** kids (therefore 6–12 total fusion actions when built from seeds). This ignores waiting, failed attempts and paid Compendium shortcuts.

| Tier-1 seed | Direct recipe rows using it | Distinct non-spawn descendants using it on either ancestral branch | Proposed spawn share |
| --- | ---: | ---: | ---: |
| `fire` | 9 | 42 | 16% |
| `plain` | 8 | 42 | 30% |
| `water` | 7 | 41 | 16% |
| `snow` | 6 | 28 | 16% |
| `wind` | 5 | 19 | 12% |
| `stone` | 2 | 16 | 10% |

The descendant count measures dependency, not number of recipes or independent unlock paths; overlap between seeds is expected. The highest direct feeders are shown first. Every non-spawn kid has one incoming recipe, which keeps production/review manageable but makes loss of one seed affect several chains; Bias and Compendium need a pacing check, not a new unlock system. A few intermediate entries (such as Cactus, Bouquet, Pretzel and Soup) are collection endpoints in the MVP and available as ingredients for later waves; reaching tier 5 is not required for every branch.

### Long-term capacity and sparsity

Budget one primary recipe per future non-spawn entry: **494 recipes for 500 types**, including the MVP's 58. Initial parent tiers stay fixed; the matrix yields the following structural target. A handful of justified alternate paths may be reviewed later, but they are outside this budget and need density recalculation.

| Result tier | Types | Primary recipes | Parent-band target density | Income per kid / s |
| --- | ---: | ---: | --- | ---: |
| 1 | 6 | 0 | — | 0.5 |
| 2 | 10 | 10 | 10/21 (47.62%) | 1.0 |
| 3 | 30 | 30 | 30/115 (26.09%) | 2.0 |
| 4 | 74 | 74 | 74/945 (7.83%) | 4.0 |
| 5 | 110 | 110 | 110/6179 (1.78%) | 8.0 |
| 6 | 120 | 120 | 120/19305 (0.62%) | 16.0 |
| 7 | 90 | 90 | 90/34860 (0.26%) | 32.0 |
| 8 | 60 | 60 | 60/35595 (0.17%) | 64.0 |

Overall target **494/125250 = 0.39%** including self-pairs; **494/124750 = 0.40%** for distinct-type pairs. Maximum dependency depth is seven fusion edges (tier 1 to tier 8). Keep at least one same-tier-top parent in each later recipe and no result above tier 8. The pool has ample unused pairs; deeper tiers are unnecessary.

The Node check constructs a **500-node structural witness** matching every family/tier cell, retaining the concrete MVP and assigning unique free lower-tier pairs to anonymous future slots. It checks reachability, uniqueness and tiers across that entire witness and at each proposed wave boundary; witness recipes only use parents already available in that wave order. This proves space/depth capacity; it does **not** establish thematic sense or approve 436 future costumes/IDs. Those future slots must be named, illustrated and hand-paired family by family. The concrete, importable and fully validated graph in this PR is the entire 64-type MVP, not a finished 500-type content graph.

## Open questions and handoff

**Owner questions: none required for this proposal.** D-038 authorizes new kids/recipes and D-046 authorizes this MVP range. No deeper tiers, spawn-unlock mechanism, new game system or gate approval is assumed. If later playtests show six seeds cannot support discovery pacing, Claude and ChatGPT should first tune existing weights/spawn/bias/compendium tools; a proposed unlock mechanism would require a separately marked owner question.

**For Claude's review:** round 2 aligns Balloon Kid and Moon Garden Kid with the proposed IDs balloon and moon_garden before shipping. IDs become permanent once shipped; future display-name changes must retain shipped IDs. The round-1 structure, six seeds and recipe rules are accepted; the spawn weights remain provisional pending Claude's simulator. Review these three revisions before accepting the final IDs. T5 requires a new shared tier badge in ASSET-MVP (current art has badges 1–4); high-tier badges 6–8 belong to later waves. Existing sound cues can cover these entries; no per-type audio is required. Dex milestones beyond 16 are Claude's later import work.

Import docs/roster-mvp.json by splitting kids/recipes and applying spawnWeights through Claude's balance review. Do not copy family/costume/witness metadata into src. Source balance fields other than spawnWeights are left intact for actual-validator checking. No source, art, balance file, task status or decision-log edits are included. Claude commits the sandbox edits unchanged as ChatGPT, reviews and pushes; this worktree does not run git.


### Batch-3 round-2 concept revisions

PR #44's blocking reads are accepted. Windmill's two broad crossing bars read as a sticking plaster; separate panels plus a visible tapered tower replace that outline target. Rescue Station's folded stretcher was too faint, so the primary becomes a hooked rescue ladder with exposed rails/rungs. Sky Fair retains the Ferris-wheel target but replaces the orthogonal cross/four boxes with five angled spokes and five upright cabins, moved clear of the crown. These changes retain IDs, tier/family/recipes, accent allocation, both components and every rig field. The three rows above describe round 2; approved art remains exact. Evidence and everyday-object comparisons: .codex-out/asset-mvp-3-notes.md, Round 2.
