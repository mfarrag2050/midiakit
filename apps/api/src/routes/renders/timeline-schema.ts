import { z } from 'zod';
import type { Timeline } from '@pf-mediakit/shared';
import { TIMELINE_OUTPUT } from '@pf-mediakit/renderer/timeline-output';

const finite = z.number().finite();
const keyframeSchema = z.object({
  t: finite,
  opacity: finite.optional(), x: finite.optional(), y: finite.optional(),
  scale: finite.optional(), rotation: finite.optional(),
  ease: z.enum(['linear', 'easeIn', 'easeOut', 'easeInOut', 'easeOutCubic',
    'easeOutBack', 'spring', 'step']).optional(),
}).passthrough();

const transitionSchema = z.object({
  between: z.tuple([z.string(), z.string()]),
  type: z.enum(['crossfade', 'slide', 'wipe', 'zoom', 'blurIn']),
  duration: finite,
  direction: z.enum(['rtl', 'ltr', 'auto']).optional(),
}).passthrough();

const itemSchema = z.object({
  id: z.string(), start: finite, end: finite,
  src: z.string().optional(),
  trimIn: finite.optional(), trimOut: finite.optional(), speed: finite.optional(),
  crop: z.object({ sx: finite, sy: finite, sw: finite, sh: finite }).passthrough().optional(),
  template: z.string().optional(), value: z.string().optional(),
  wrap: z.enum(['uniform', 'alternating']).optional(),
  anchor: z.union([z.enum(['top', 'center', 'bottom']), finite]).optional(),
  offset: z.object({ x: finite.optional(), y: finite.optional() }).passthrough().optional(),
  reveal: z.object({
    mode: z.enum(['byWord', 'byChar']), direction: z.enum(['rtl', 'ltr']), stagger: finite,
  }).passthrough().optional(),
  fsScale: finite.optional(), gain: finite.optional(),
  fadeIn: finite.optional(), fadeOut: finite.optional(), loop: z.boolean().optional(),
  ducking: z.object({
    target: z.string(), amount: finite, attack: finite, release: finite,
  }).passthrough().optional(),
  effects: z.array(z.object({ type: z.string() }).passthrough()).optional(),
  keyframes: z.array(keyframeSchema).optional(),
}).passthrough();

// Same export ceilings as renderer/validate.ts; the legacy headline estimate
// does not describe a supplied timeline. No defaults/transforms may rewrite it.
const timelineStructure = z.object({
  duration: finite.positive().max(90),
  fps: finite.min(1).max(60),
  size: z.enum(['square', 'portrait', 'reel']).refine((size) => {
    const { w, h } = TIMELINE_OUTPUT[size].dimensions;
    return w >= 320 && w <= 4096 && h >= 320 && h <= 4096;
  }),
  tracks: z.array(z.object({
    id: z.string(), type: z.enum(['media', 'text', 'audio']), index: finite,
    items: z.array(itemSchema),
    transitions: z.array(transitionSchema).optional(),
  }).passthrough()).nonempty(),
}).passthrough();

// Validate without replacing the input: Zod's object output models optional
// keys as `T | undefined`, unlike shared's exact optional properties.
export const timelineSchema = z.custom<Timeline>().superRefine((timeline, ctx) => {
  const checked = timelineStructure.safeParse(timeline);
  if (!checked.success) {
    for (const issue of checked.error.issues) ctx.addIssue(issue);
  }
});
