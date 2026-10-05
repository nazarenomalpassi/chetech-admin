import { z } from "zod";

export const activityCursorSchema = z.object({
  date: z.string().datetime({ offset: true }).refine((value) => Number.isFinite(Date.parse(value))),
  id: z.string().uuid()
});

export const activityPageSchema = z.object({
  events: z.array(z.object({
    id: z.string().uuid(),
    kind: z.string(),
    message: z.string(),
    actorName: z.string(),
    createdAt: activityCursorSchema.shape.date
  })).max(30),
  nextCursor: activityCursorSchema.nullable()
}).refine(({ events, nextCursor }) => {
  const oldest = events.at(-1);
  return new Set(events.map((event) => event.id)).size === events.length &&
    (!nextCursor || Boolean(oldest && nextCursor.id === oldest.id && nextCursor.date === oldest.createdAt));
});

export type ActivityCursor = z.infer<typeof activityCursorSchema>;
export type ActivityPage = z.infer<typeof activityPageSchema>;
