import { ApolloServer } from '@apollo/server'
import { startServerAndCreateNextHandler } from '@as-integrations/next'
import { GraphQLError, ValidationContext } from 'graphql'
import type { ASTNode, ValidationRule } from 'graphql'
import { NextRequest, NextResponse } from 'next/server'
import { typeDefs } from '@/lib/graphql/typeDefs'
import { resolvers } from '@/lib/graphql/resolvers'
import { getClientIp, checkRateLimit } from '@/lib/rate-limit'

// ── CORS ──────────────────────────────────────────────────────────────────────
// Restrict cross-origin access to known app origins. Same-origin requests from
// crashmap.io itself do not need CORS headers, but these protect against
// third-party sites driving traffic via browser-based cross-origin requests.

const ALLOWED_ORIGINS = new Set([
  'https://crashmap.io',
  'https://crashmap.onrender.com',
  'http://localhost:3000',
])

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}

function getCorsOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin')
  return origin && ALLOWED_ORIGINS.has(origin) ? origin : 'https://crashmap.io'
}

// Clone a Response, copying its body/status/headers, then add CORS headers.
async function withCors(response: Response, request: NextRequest): Promise<NextResponse> {
  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', getCorsOrigin(request))
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value)
  }
  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

// ── Query depth limiting ──────────────────────────────────────────────────────
// Rejects queries deeper than MAX_DEPTH before they reach any resolver.
// Our schema is shallow (max legitimate depth ≈ 3), so 5 leaves ample headroom.

const MAX_DEPTH = 5

function queryDepth(node: ASTNode, depth = 0): number {
  if ('selectionSet' in node && node.selectionSet) {
    const sels = (node.selectionSet as { selections: readonly ASTNode[] }).selections
    if (sels.length === 0) return depth
    return Math.max(...sels.map((s) => queryDepth(s, depth + 1)))
  }
  return depth
}

const depthLimitRule: ValidationRule = (context: ValidationContext) => ({
  Document(doc) {
    for (const def of doc.definitions) {
      const depth = queryDepth(def as ASTNode)
      if (depth > MAX_DEPTH) {
        context.reportError(new GraphQLError(`Query depth limit exceeded (max: ${MAX_DEPTH}).`))
      }
    }
  },
})

// ── Apollo Server ─────────────────────────────────────────────────────────────

const server = new ApolloServer({ typeDefs, resolvers, validationRules: [depthLimitRule] })

const handler = startServerAndCreateNextHandler<NextRequest>(server)

export async function OPTIONS(request: NextRequest) {
  return withCors(new Response(null, { status: 204 }), request)
}

export async function GET(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return withCors(await handler(request), request)
}

export async function POST(request: NextRequest) {
  const limited = checkRateLimit(getClientIp(request))
  if (limited) return limited
  return withCors(await handler(request), request)
}
