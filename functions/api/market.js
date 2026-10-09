import { handleMarket } from '../_lib/market.mjs';

export function onRequest(context) {
  return handleMarket(context.request, { waitUntil: promise => context.waitUntil(promise) });
}
