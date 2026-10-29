import type { PendingArrival } from '../sim/game';

/** Where an arrival came from: the Garden, a plot, or a fusion (D-087, D-088). */
export type MeetSource = PendingArrival['source'];

/** Ten lines per source (§27.5): every one names the kind once, with no pronoun. */
export const LINES: Record<MeetSource, readonly string[]> = {
  garden: ['{name} wandered in!', '{name} arrived!', '{name} stopped by!', '{name} joined the garden!', '{name} found the garden!', '{name} came to visit!', '{name} made an entrance!', '{name} is here!', '{name} came along!', '{name} paid a visit!'],
  plot: ['{name} sprouted!', '{name} has sprouted!', '{name} grew from the plot!', '{name} is ready to meet!', "{name} is the plot's surprise!", '{name} has grown!', '{name} is fresh from the plot!', '{name} came from the plot!', '{name} is a growing surprise!', '{name} is the harvest!'],
  fusion: ['{name} is a new discovery!', '{name} appeared in a fusion!', '{name} came from a fusion!', '{name} joined the discoveries!', '{name} is a fresh find!', '{name} is a fusion surprise!', '{name} arrived through fusion!', '{name} is a brand-new find!', '{name} is a new kind to meet!', '{name} is a discovery to keep!'],
};
