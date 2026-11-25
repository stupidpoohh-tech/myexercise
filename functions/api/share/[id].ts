import { handleShare, type Env } from '../../../src/server/share';

/** Cloudflare Pages Function — /api/share/:id */
export const onRequest = (ctx: { request: Request; env: Env; params: { id: string | string[] } }) => {
  const id = Array.isArray(ctx.params.id) ? ctx.params.id[0] : ctx.params.id;
  return handleShare(ctx.request, ctx.env, id);
};
