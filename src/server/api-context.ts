import 'server-only';
import { assertSameOrigin, resolveVisitor, type Visitor } from './access/visitor';
import { getDeps, visitorOptions } from './dependencies';
import { serverEnv } from './env';
import type { PlatformDeps } from './platform';

export interface ApiContext {
  deps: PlatformDeps;
  visitor: Visitor;
}

/** Same-origin check, platform dependencies and the guest owner for a mutating request. */
export function mutationContext(request: Request): ApiContext {
  assertSameOrigin(request, serverEnv().appUrl);
  const deps = getDeps();
  return { deps, visitor: resolveVisitor(request, visitorOptions()) };
}

export function readContext(request: Request): ApiContext {
  const deps = getDeps();
  return { deps, visitor: resolveVisitor(request, visitorOptions()) };
}
